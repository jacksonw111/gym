"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// emas/functions/auto-complete-lessons/src/index.ts
var index_exports = {};
__export(index_exports, {
  createAutoCompleteEntrypoint: () => createAutoCompleteEntrypoint,
  main: () => main
});
module.exports = __toCommonJS(index_exports);

// server/gym/store.ts
var cloneJson = (value) => JSON.parse(JSON.stringify(value));
var DomainError = class extends Error {
};
var assertPackageInvariant = (membership) => {
  if (membership.availableLessons < 0 || membership.lockedLessons < 0 || membership.usedLessons < 0 || membership.availableLessons + membership.lockedLessons + membership.usedLessons !== membership.totalLessons) {
    throw new DomainError("\u8BFE\u65F6\u4F59\u989D\u4E0D\u5408\u6CD5");
  }
};
var appendLedger = (store, entry) => {
  const created = { ...entry, id: store.nextId("ledger") };
  store.ledger.push(created);
  return created;
};

// server/gym/auth.ts
var assertCanAccessLesson = (actor, lesson) => {
  if (actor.kind === "admin" || actor.kind === "system") return;
  if (actor.kind === "member" && lesson.memberId === actor.id) return;
  if (actor.kind === "coach" && lesson.coachId === actor.id) return;
  throw new DomainError("\u6CA1\u6709\u6743\u9650\u8BBF\u95EE\u8BE5\u8BFE\u7A0B");
};

// server/gym/lessons.ts
var getBookedLessonAndPackage = (store, lessonId) => {
  const lesson = store.lessons.find((item) => item.id === lessonId);
  if (!lesson) throw new DomainError("\u8BFE\u7A0B\u4E0D\u5B58\u5728");
  if (lesson.status !== "booked") throw new DomainError("\u7EC8\u6001\u8BFE\u7A0B\u4E0D\u80FD\u518D\u6B21\u8F6C\u6362");
  const membership = store.packages.find((item) => item.id === lesson.membershipPackageId);
  if (!membership) throw new DomainError("\u8BFE\u5305\u4E0D\u5B58\u5728");
  return { lesson, membership };
};
var consumeLockedLesson = (store, lesson, membership, now, actorId) => {
  membership.lockedLessons -= 1;
  membership.usedLessons += 1;
  assertPackageInvariant(membership);
  appendLedger(store, {
    packageId: membership.id,
    lessonId: lesson.id,
    operation: "consume",
    availableDelta: 0,
    lockedDelta: -1,
    usedDelta: 1,
    totalDelta: 0,
    createdAt: now,
    actorId
  });
};
var completeLesson = async (store, input) => store.transaction(() => {
  const existing = store.lessons.find((item) => item.id === input.lessonId);
  if (!existing) throw new DomainError("\u8BFE\u7A0B\u4E0D\u5B58\u5728");
  if (input.actor.kind === "admin") throw new DomainError("\u7BA1\u7406\u5458\u4E0D\u80FD\u5B8C\u6210\u8BFE\u7A0B");
  if (input.actor.kind !== "system") assertCanAccessLesson(input.actor, existing);
  if (existing.status === "completed") return existing;
  const { lesson, membership } = getBookedLessonAndPackage(store, input.lessonId);
  const elapsed = new Date(input.now).getTime() - new Date(lesson.endsAt).getTime();
  if (input.actor.kind === "system") {
    if (elapsed < 24 * 60 * 60 * 1e3) throw new DomainError("\u7ED3\u675F\u672A\u6EE124\u5C0F\u65F6");
  } else if (elapsed < 0) {
    throw new DomainError("\u8BFE\u7A0B\u5C1A\u672A\u7ED3\u675F");
  }
  consumeLockedLesson(store, lesson, membership, input.now, input.actor.id);
  lesson.status = "completed";
  lesson.completionSource = input.actor.kind;
  lesson.consumedAt = input.now;
  return lesson;
});
var autoCompleteDueLessons = async (store, now) => {
  const threshold = new Date(now).getTime() - 24 * 60 * 60 * 1e3;
  const dueIds = store.lessons.filter(
    (lesson) => lesson.status === "booked" && new Date(lesson.endsAt).getTime() <= threshold
  ).map((lesson) => lesson.id);
  const completed = [];
  for (const lessonId of dueIds) {
    await completeLesson(store, {
      actor: { kind: "system", id: "auto-complete-lessons" },
      lessonId,
      now
    });
    completed.push(lessonId);
  }
  return completed;
};

// server/gym/store-emas.ts
var import_node_crypto = require("node:crypto");
var PAGE_SIZE = 100;
var recordsFromResult = (result) => {
  if (!Array.isArray(result)) return [];
  return result.filter((item) => Boolean(item) && typeof item === "object").map((item) => {
    const record = cloneJson(item);
    if (typeof record.id !== "string" && typeof record._id === "string") record.id = record._id;
    delete record._id;
    return record;
  });
};
var EMAS_COLLECTIONS = {
  users: "users",
  coaches: "coaches",
  products: "products",
  memberships: "memberships",
  orders: "orders",
  schedules: "schedules",
  lessons: "lessons",
  appeals: "appeals",
  ledger: "ledger",
  admins: "admins",
  adminSessions: "admin_sessions",
  bookingLocks: "booking_locks",
  operations: "operations"
};
var EmasStore = class {
  constructor(database) {
    this.database = database;
    this.users = [];
    this.coaches = [];
    this.products = [];
    this.packages = [];
    this.orders = [];
    this.schedules = [];
    this.lessons = [];
    this.appeals = [];
    this.ledger = [];
    this.admins = [];
    this.sessions = [];
    this.bookingLocks = [];
    this.operations = [];
  }
  definitions() {
    return [
      {
        name: EMAS_COLLECTIONS.users,
        read: () => this.users,
        write: (records) => {
          this.users = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.coaches,
        read: () => this.coaches,
        write: (records) => {
          this.coaches = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.products,
        read: () => this.products,
        write: (records) => {
          this.products = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.memberships,
        read: () => this.packages,
        write: (records) => {
          this.packages = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.orders,
        read: () => this.orders,
        write: (records) => {
          this.orders = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.schedules,
        read: () => this.schedules,
        write: (records) => {
          this.schedules = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.lessons,
        read: () => this.lessons,
        write: (records) => {
          this.lessons = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.appeals,
        read: () => this.appeals,
        write: (records) => {
          this.appeals = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.ledger,
        read: () => this.ledger,
        write: (records) => {
          this.ledger = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.admins,
        read: () => this.admins,
        write: (records) => {
          this.admins = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.adminSessions,
        read: () => this.sessions,
        write: (records) => {
          this.sessions = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.bookingLocks,
        read: () => this.bookingLocks,
        write: (records) => {
          this.bookingLocks = records;
        }
      },
      {
        name: EMAS_COLLECTIONS.operations,
        read: () => this.operations,
        write: (records) => {
          this.operations = records;
        }
      }
    ];
  }
  async loadFrom(provider) {
    for (const definition of this.definitions()) {
      const records = [];
      let offset = 0;
      while (true) {
        const response = await provider.collection(definition.name).find(
          {},
          {
            skip: offset,
            limit: PAGE_SIZE
          }
        );
        const page = recordsFromResult(response.result);
        records.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      definition.write(records);
    }
  }
  async load() {
    await this.loadFrom(this.database);
  }
  async transaction(work) {
    const transaction = await this.database.startTransaction();
    try {
      const before = new Map(
        this.definitions().map((definition) => [
          definition.name,
          new Map(definition.read().map((record) => [record.id, JSON.stringify(record)]))
        ])
      );
      const result = await work();
      for (const definition of this.definitions()) {
        const collection = transaction.collection(definition.name);
        const previous = before.get(definition.name) ?? /* @__PURE__ */ new Map();
        const current = new Map(definition.read().map((record) => [record.id, record]));
        for (const [id, record] of current) {
          if (previous.get(id) !== JSON.stringify(record)) {
            await collection.replaceOne({ id }, cloneJson(record), { upsert: true });
          }
        }
        for (const id of previous.keys()) {
          if (!current.has(id)) await collection.deleteOne({ id });
        }
      }
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      await this.load();
      throw error;
    }
  }
  nextId(prefix) {
    return `${prefix}-${(0, import_node_crypto.randomUUID)()}`;
  }
};

// emas/functions/runtime.ts
var createRuntimeStore = (context) => new EmasStore(context.mpserverless.db);

// emas/functions/auto-complete-lessons/src/index.ts
var createAutoCompleteEntrypoint = (options) => async (context) => {
  const store = options.storeFactory(context);
  try {
    await store.load?.();
    const completedLessonIds = await autoCompleteDueLessons(
      store,
      options.nowProvider?.() ?? (/* @__PURE__ */ new Date()).toISOString()
    );
    return { ok: true, data: { completedLessonIds } };
  } catch {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" }
    };
  }
};
var main = createAutoCompleteEntrypoint({
  storeFactory: createRuntimeStore
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAutoCompleteEntrypoint,
  main
});
module.exports = module.exports.main;
