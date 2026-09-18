// Drive the Google Calendar sync end to end against a REAL Postgres and a
// STUB Google, and assert the things that only go wrong in production:
//
//   - an event edited upstream updates in place rather than duplicating;
//   - an event deleted upstream disappears locally;
//   - an event outside the sync window is NOT deleted just because this run
//     did not see it;
//   - all-day and timed events map differently, and Google's exclusive all-day
//     end date survives untouched;
//   - a declined invitation and a cancelled occurrence never arrive;
//   - unticking a calendar deletes what came from it, and only that;
//   - one unreadable calendar does not abandon the others.
//
// Run:  DATABASE_URL=… node scripts/test-calendar-sync.mjs
//
// It compiles the three modules under test with tsc into a temp directory
// rather than importing the Next build, so it exercises the same source the app
// runs and needs no server.

import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const out = mkdtempSync(join(tmpdir(), 'gigi-sync-'));
let pass = 0, fail = 0;

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

execFileSync(
  'npx',
  [
    'tsc',
    'src/lib/calendar-sync.ts',
    '--outDir', out,
    // Keep the src/lib/ layout in the output; without a rootDir tsc infers the
    // common directory and flattens everything to the top.
    '--rootDir', 'src',
    '--module', 'commonjs',
    '--target', 'es2022',
    '--moduleResolution', 'node',
    '--esModuleInterop',
    '--skipLibCheck',
  ],
  { stdio: 'inherit' },
);

// The compiled output still `require`s `postgres`, so it needs to resolve from
// somewhere. A link beats copying node_modules and beats compiling in-tree.
symlinkSync(join(process.cwd(), 'node_modules'), join(out, 'node_modules'), 'dir');

const { syncGoogleCalendars, refreshCalendarList, mapEvent, shouldImport, isStale, syncWindow } =
  await import(join(out, 'lib/calendar-sync.js'));
const store = await import(join(out, 'lib/store.js'));
const { closeDb } = await import(join(out, 'lib/db.js'));

// --- A Google that does exactly what we tell it -------------------------------

function stubApi(calendars, eventsByCalendar, failing = new Set()) {
  return {
    async listCalendars() { return calendars; },
    async listEvents(calendarId) {
      if (failing.has(calendarId)) throw new Error('Calendar unavailable');
      return eventsByCalendar[calendarId] ?? [];
    },
  };
}

const day = (offset) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};
const at = (offset, time) => `${day(offset)}T${time}:00+01:00`;

async function main() {
  const email = `cal_${Date.now()}@example.com`;
  const { household } = await store.createHousehold({
    ownerName: 'Cal Tester',
    email,
    passwordHash: 'x:y',
    recoveryHash: 'z',
  });
  const hid = household.id;

  console.log('\n== pure mapping ==');
  check('cancelled is not imported', shouldImport({ id: 'a', status: 'cancelled', start: { date: day(1) } }) === false);
  check('no start is not imported', shouldImport({ id: 'a' }) === false);
  check('declined is not imported',
    shouldImport({ id: 'a', start: { date: day(1) }, attendees: [{ self: true, responseStatus: 'declined' }] }) === false);
  check('accepted is imported',
    shouldImport({ id: 'a', start: { date: day(1) }, attendees: [{ self: true, responseStatus: 'accepted' }] }) === true);
  check("someone else's decline does not hide it",
    shouldImport({ id: 'a', start: { date: day(1) }, attendees: [{ responseStatus: 'declined' }] }) === true);

  const cal = { calendarId: 'c1', category: 'school', timeZone: 'Europe/London' };
  const allDay = mapEvent({ id: 'e1', summary: 'Inset day', start: { date: day(3) }, end: { date: day(4) } }, cal);
  check('all-day flagged', allDay.allDay === true);
  check('all-day start is a date', allDay.start === day(3), allDay.start);
  check('exclusive end copied untouched', allDay.end === day(4), allDay.end);
  check('all-day carries no timezone', allDay.tzid === undefined);

  const timed = mapEvent(
    { id: 'e2', summary: 'Dentist', location: 'High St', start: { dateTime: at(2, '09:00'), timeZone: 'Europe/Stockholm' }, end: { dateTime: at(2, '10:00') } },
    cal,
  );
  check('timed not all-day', timed.allDay === false);
  check("event's own zone wins", timed.tzid === 'Europe/Stockholm', timed.tzid);
  check('location kept', timed.location === 'High St');
  check('category comes from the calendar', timed.category === 'school');
  check('sourceRef identifies calendar + event', timed.sourceRef === 'gcal:c1:e2', timed.sourceRef);

  const busy = mapEvent({ id: 'e3', start: { date: day(1) } }, cal);
  check('untitled becomes (Busy)', busy.summary === '(Busy)', busy.summary);

  console.log('\n== calendar list ==');
  let api = stubApi(
    [
      { id: 'personal@example.com', summary: 'Personal', primary: true, timeZone: 'Europe/London', backgroundColor: '#123456' },
      { id: 'school@example.com', summary: 'School', timeZone: 'Europe/London' },
      { id: 'holidays@example.com', summary: 'UK Holidays' },
    ],
    {},
  );
  let calendars = await refreshCalendarList(api, hid);
  check('three calendars listed', calendars.length === 3, String(calendars.length));
  check('nothing is selected by default', calendars.every((c) => !c.selected));
  check('primary flagged', calendars.find((c) => c.calendarId === 'personal@example.com')?.isPrimary === true);
  check('colour kept', calendars.find((c) => c.isPrimary)?.backgroundColor === '#123456');

  console.log('\n== first sync ==');
  const events = {
    'personal@example.com': [
      { id: 'p1', summary: 'Dentist', start: { dateTime: at(2, '09:00') }, end: { dateTime: at(2, '10:00') } },
      { id: 'p2', summary: 'Dinner with Sam', start: { dateTime: at(5, '19:00') }, end: { dateTime: at(5, '21:00') } },
      { id: 'p3', summary: 'Declined thing', start: { dateTime: at(6, '11:00') }, attendees: [{ self: true, responseStatus: 'declined' }] },
      { id: 'p4', summary: 'Cancelled thing', status: 'cancelled', start: { dateTime: at(7, '11:00') } },
    ],
    'school@example.com': [
      { id: 's1', summary: 'Parents evening', start: { date: day(9) }, end: { date: day(10) } },
    ],
  };
  api = stubApi([], events);

  await store.setGoogleCalendarSelection(hid, 'personal@example.com', { selected: true, category: 'appointment' });
  await store.setGoogleCalendarSelection(hid, 'school@example.com', { selected: true, category: 'school' });

  let result = await syncGoogleCalendars(api, hid);
  check('two calendars synced', result.calendars === 2, String(result.calendars));
  check('three events imported', result.imported === 3, String(result.imported));
  check('no errors', result.errors.length === 0, JSON.stringify(result.errors));

  let stored = await store.listStoredEvents(hid);
  check('three rows stored', stored.length === 3, String(stored.length));
  check('declined not stored', !stored.some((e) => e.summary === 'Declined thing'));
  check('cancelled not stored', !stored.some((e) => e.summary === 'Cancelled thing'));
  check('all marked google', stored.every((e) => e.source === 'google'));
  check('calendar recorded on the row',
    stored.find((e) => e.summary === 'Parents evening')?.externalCalendarId === 'school@example.com');
  check('school category applied',
    stored.find((e) => e.summary === 'Parents evening')?.category === 'school');
  check('appointment category applied',
    stored.find((e) => e.summary === 'Dentist')?.category === 'appointment');

  console.log('\n== re-sync is idempotent ==');
  result = await syncGoogleCalendars(api, hid);
  stored = await store.listStoredEvents(hid);
  check('still three rows, not six', stored.length === 3, String(stored.length));
  check('nothing removed', result.removed === 0, String(result.removed));

  console.log('\n== upstream edit updates in place ==');
  const beforeId = stored.find((e) => e.summary === 'Dentist').id;
  events['personal@example.com'][0].summary = 'Dentist (moved)';
  events['personal@example.com'][0].start = { dateTime: at(3, '14:00') };
  await syncGoogleCalendars(api, hid);
  stored = await store.listStoredEvents(hid);
  const moved = stored.find((e) => e.summary === 'Dentist (moved)');
  check('title updated', Boolean(moved));
  check('same row, not a new one', moved?.id === beforeId, `${moved?.id} vs ${beforeId}`);
  check('start updated', moved?.start.startsWith(day(3)), moved?.start);
  check('old title gone', !stored.some((e) => e.summary === 'Dentist'));

  console.log('\n== upstream delete removes it here ==');
  events['personal@example.com'] = events['personal@example.com'].filter((e) => e.id !== 'p2');
  result = await syncGoogleCalendars(api, hid);
  stored = await store.listStoredEvents(hid);
  check('one removed', result.removed === 1, String(result.removed));
  check('dinner gone', !stored.some((e) => e.summary === 'Dinner with Sam'));
  check('the others survived', stored.length === 2, String(stored.length));

  console.log('\n== an event outside the window is not collateral damage ==');
  // Import something far in the future, then sync a response that does not
  // mention it. A reconcile that deletes by calendar alone would wipe it.
  const farOff = day(400);
  await store.replaceGoogleEvents(
    hid,
    'personal@example.com',
    { from: `${farOff}T00:00:00.000Z`, to: `${farOff}T23:59:59.000Z` },
    [{ summary: 'Flight to Málaga', category: 'travel', start: farOff, allDay: true, sourceRef: 'gcal:personal@example.com:far1' }],
  );
  stored = await store.listStoredEvents(hid);
  check('far-future event stored', stored.some((e) => e.summary === 'Flight to Málaga'));
  await syncGoogleCalendars(api, hid);
  stored = await store.listStoredEvents(hid);
  check('far-future event survived a sync that never mentioned it',
    stored.some((e) => e.summary === 'Flight to Málaga'));

  console.log('\n== a manual event is never touched by the sync ==');
  const manual = await store.addCalendarEvent({
    householdId: hid, summary: 'Typed in by hand', category: 'other', start: day(4), allDay: true,
  });
  await syncGoogleCalendars(api, hid);
  stored = await store.listStoredEvents(hid);
  check('manual event survived', stored.some((e) => e.id === manual.id));
  check('manual event still manual', stored.find((e) => e.id === manual.id)?.source === 'manual');

  console.log('\n== imported events cannot be edited or deleted locally ==');
  const imported = stored.find((e) => e.source === 'google');
  const edited = await store.updateCalendarEvent(hid, imported.id, { summary: 'Hacked' });
  check('update refuses an imported row', edited === undefined);
  const deleted = await store.deleteCalendarEvent(hid, imported.id);
  check('delete refuses an imported row', deleted === false);
  check('manual row is still editable',
    (await store.updateCalendarEvent(hid, manual.id, { summary: 'Renamed' }))?.summary === 'Renamed');

  console.log('\n== re-categorising applies to what is already imported ==');
  await store.setGoogleCalendarSelection(hid, 'school@example.com', { category: 'travel' });
  stored = await store.listStoredEvents(hid);
  check('existing rows re-categorised',
    stored.find((e) => e.summary === 'Parents evening')?.category === 'travel');

  console.log('\n== one bad calendar does not abandon the rest ==');
  const failingApi = stubApi([], events, new Set(['school@example.com']));
  result = await syncGoogleCalendars(failingApi, hid);
  check('the failure is reported', result.errors.length === 1, JSON.stringify(result.errors));
  check('it names the calendar', result.errors[0]?.calendarId === 'school@example.com');
  stored = await store.listStoredEvents(hid);
  check('the good calendar still synced', stored.some((e) => e.summary === 'Dentist (moved)'));
  check('the failed calendar kept its events', stored.some((e) => e.summary === 'Parents evening'));
  const cals = await store.listGoogleCalendars(hid);
  check('the error is recorded against it',
    Boolean(cals.find((c) => c.calendarId === 'school@example.com')?.lastError));

  console.log('\n== unticking deletes only that calendar ==');
  await store.setGoogleCalendarSelection(hid, 'school@example.com', { selected: false });
  stored = await store.listStoredEvents(hid);
  check('school events gone', !stored.some((e) => e.summary === 'Parents evening'));
  check('personal events kept', stored.some((e) => e.summary === 'Dentist (moved)'));
  check('manual event kept', stored.some((e) => e.id === manual.id));

  console.log('\n== a calendar removed from the account takes its events with it ==');
  api = stubApi(
    [{ id: 'personal@example.com', summary: 'Personal', primary: true }],
    events,
  );
  calendars = await refreshCalendarList(api, hid);
  check('list shrank to one', calendars.length === 1, String(calendars.length));
  check('selection on the survivor kept', calendars[0].selected === true);
  stored = await store.listStoredEvents(hid);
  check('no orphaned imported rows',
    stored.filter((e) => e.source === 'google').every((e) => e.externalCalendarId === 'personal@example.com'));

  console.log('\n== staleness gate ==');
  check('nothing selected is never stale', isStale([]) === false);
  check('never synced is stale', isStale([{ selected: true }]) === true);
  check('just synced is fresh',
    isStale([{ selected: true, lastSyncedAt: new Date().toISOString() }]) === false);
  check('an hour ago is stale',
    isStale([{ selected: true, lastSyncedAt: new Date(Date.now() - 3600_000).toISOString() }]) === true);
  const w = syncWindow(new Date('2026-06-15T12:00:00Z'));
  check('window starts 14 days back', w.from.startsWith('2026-06-01'), w.from);
  check('window ends 180 days on', w.to.startsWith('2026-12-12'), w.to);

  console.log('\n== turning sync off entirely ==');
  const { removed } = await store.disconnectGoogleCalendars(hid);
  check('imported events removed', removed > 0, String(removed));
  stored = await store.listStoredEvents(hid);
  check('no google rows left', !stored.some((e) => e.source === 'google'));
  check('manual event still there', stored.some((e) => e.id === manual.id));
  check('calendar list forgotten', (await store.listGoogleCalendars(hid)).length === 0);

  console.log('\n== the trust log is still intact after all of that ==');
  const integrity = await store.verifyProcessingChain(hid);
  check('chain verifies', integrity.ok === true, JSON.stringify(integrity));

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  rmSync(out, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
