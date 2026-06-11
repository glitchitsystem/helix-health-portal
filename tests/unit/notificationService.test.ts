jest.mock('../../server/src/db/database');

import { getDb } from '../../server/src/db/database';
import {
  notify,
  notifyNewMessage,
  notifyRefillReview,
  notifyAppointmentReminder,
  notifyLabResult,
  notifyAppointmentChange,
} from '../../server/src/services/notificationService';

const mockGetDb = getDb as jest.Mock;

function makeDb(opts: { participants?: { user_id: number }[] } = {}) {
  const insertRun = jest.fn().mockReturnValue({ lastInsertRowid: 1 });
  const participantsAll = jest.fn().mockReturnValue(opts.participants ?? []);

  const prepare = jest.fn((sql: string) => {
    if (sql.includes('SELECT user_id FROM message_thread_participants')) {
      return { all: participantsAll };
    }
    return { run: insertRun };
  });

  return { db: { prepare }, insertRun, participantsAll };
}

describe('notify', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('notify persists a notification row and logs the mocked delivery', () => {
    // Arrange
    const { db, insertRun } = makeDb();
    mockGetDb.mockReturnValue(db);

    // Act
    notify({
      userId: 7,
      type: 'lab_result',
      title: 'Lab result available',
      body: 'Your CBC result is now available.',
      dataJson: { lab_result_id: 99 },
    });

    // Assert
    expect(insertRun).toHaveBeenCalledWith(
      7,
      'lab_result',
      'Lab result available',
      'Your CBC result is now available.',
      JSON.stringify({ lab_result_id: 99 }),
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[NOTIFICATION] → user#7 [lab_result] Lab result available'),
    );
  });

  it('notify persists a null data_json when no dataJson is provided', () => {
    // Arrange
    const { db, insertRun } = makeDb();
    mockGetDb.mockReturnValue(db);

    // Act
    notify({ userId: 3, type: 'new_message', title: 'Hi', body: 'Body' });

    // Assert
    expect(insertRun).toHaveBeenCalledWith(3, 'new_message', 'Hi', 'Body', null);
  });

  it('notify logs and swallows the error when persisting fails', () => {
    // Arrange
    mockGetDb.mockReturnValue({
      prepare: jest.fn(() => {
        throw new Error('Database unavailable');
      }),
    });

    // Act
    expect(() =>
      notify({ userId: 1, type: 'lab_result', title: 'T', body: 'B' }),
    ).not.toThrow();

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[NOTIFICATION] Failed to persist notification:',
      expect.any(Error),
    );
  });
});

describe('notifyNewMessage', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('notifyNewMessage notifies every participant except the sender', () => {
    // Arrange
    const { db, insertRun } = makeDb({
      participants: [{ user_id: 2 }, { user_id: 3 }],
    });
    mockGetDb.mockReturnValue(db);

    // Act
    notifyNewMessage(10, 'Question about refill', 1);

    // Assert
    expect(insertRun).toHaveBeenCalledTimes(2);
    expect(insertRun).toHaveBeenCalledWith(
      2,
      'new_message',
      'New message received',
      expect.stringContaining('Question about refill'),
      JSON.stringify({ thread_id: 10 }),
    );
    expect(insertRun).toHaveBeenCalledWith(
      3,
      'new_message',
      'New message received',
      expect.stringContaining('Question about refill'),
      JSON.stringify({ thread_id: 10 }),
    );
  });

  it('notifyNewMessage does nothing when there are no other participants', () => {
    // Arrange
    const { db, insertRun } = makeDb({ participants: [] });
    mockGetDb.mockReturnValue(db);

    // Act
    notifyNewMessage(10, 'Solo thread', 1);

    // Assert
    expect(insertRun).not.toHaveBeenCalled();
  });

  it('notifyNewMessage logs and swallows the error when the lookup fails', () => {
    // Arrange
    mockGetDb.mockReturnValue({
      prepare: jest.fn(() => {
        throw new Error('Database unavailable');
      }),
    });

    // Act
    expect(() => notifyNewMessage(10, 'Subject', 1)).not.toThrow();

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[NOTIFICATION] notifyNewMessage failed:',
      expect.any(Error),
    );
  });
});

describe('notifyRefillReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('notifyRefillReview notifies the patient that a refill was approved', () => {
    // Arrange
    const { db, insertRun } = makeDb();
    mockGetDb.mockReturnValue(db);

    // Act
    notifyRefillReview(5, 'Lisinopril', true, 42);

    // Assert
    expect(insertRun).toHaveBeenCalledWith(
      5,
      'refill_approved',
      'Refill request approved',
      expect.stringContaining('Lisinopril'),
      JSON.stringify({ prescription_id: 42 }),
    );
  });

  it('notifyRefillReview notifies the patient that a refill was denied', () => {
    // Arrange
    const { db, insertRun } = makeDb();
    mockGetDb.mockReturnValue(db);

    // Act
    notifyRefillReview(5, 'Lisinopril', false, 42);

    // Assert
    expect(insertRun).toHaveBeenCalledWith(
      5,
      'refill_denied',
      'Refill request denied',
      expect.stringContaining('denied'),
      JSON.stringify({ prescription_id: 42 }),
    );
  });
});

describe('notifyAppointmentReminder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('notifyAppointmentReminder notifies the user with the hours-ahead label', () => {
    // Arrange
    const { db, insertRun } = makeDb();
    mockGetDb.mockReturnValue(db);

    // Act
    notifyAppointmentReminder(8, 100, '2026-06-15T10:00:00.000Z', 24);

    // Assert
    expect(insertRun).toHaveBeenCalledWith(
      8,
      'appointment_reminder',
      'Appointment reminder (24h)',
      expect.stringContaining('Reminder: You have an appointment'),
      JSON.stringify({ appointment_id: 100 }),
    );
  });
});

describe('notifyLabResult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('notifyLabResult notifies the user that a result is available', () => {
    // Arrange
    const { db, insertRun } = makeDb();
    mockGetDb.mockReturnValue(db);

    // Act
    notifyLabResult(8, 'CBC', 200);

    // Assert
    expect(insertRun).toHaveBeenCalledWith(
      8,
      'lab_result',
      'Lab result available',
      expect.stringContaining('CBC'),
      JSON.stringify({ lab_result_id: 200 }),
    );
  });
});

describe('notifyAppointmentChange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('notifyAppointmentChange notifies the user about a cancellation', () => {
    // Arrange
    const { db, insertRun } = makeDb();
    mockGetDb.mockReturnValue(db);

    // Act
    notifyAppointmentChange(8, 100, 'cancelled');

    // Assert
    expect(insertRun).toHaveBeenCalledWith(
      8,
      'appointment_cancelled',
      'Appointment cancelled',
      expect.stringContaining('cancelled'),
      JSON.stringify({ appointment_id: 100 }),
    );
  });

  it('notifyAppointmentChange notifies the user about a reschedule', () => {
    // Arrange
    const { db, insertRun } = makeDb();
    mockGetDb.mockReturnValue(db);

    // Act
    notifyAppointmentChange(8, 100, 'rescheduled');

    // Assert
    expect(insertRun).toHaveBeenCalledWith(
      8,
      'appointment_rescheduled',
      'Appointment rescheduled',
      expect.stringContaining('rescheduled'),
      JSON.stringify({ appointment_id: 100 }),
    );
  });
});
