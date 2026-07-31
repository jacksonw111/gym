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

// emas/functions/seed/src/index.ts
var index_exports = {};
__export(index_exports, {
  createSeedEntrypoint: () => createSeedEntrypoint,
  main: () => main
});
module.exports = __toCommonJS(index_exports);

// server/gym/store.ts
var cloneJson = (value) => JSON.parse(JSON.stringify(value));

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

// emas/functions/seed/src/index.ts
var upsertById = (records, incoming) => {
  const existing = records.find((item) => item.id === incoming.id);
  if (existing) {
    Object.assign(existing, incoming);
  } else {
    records.push(incoming);
  }
};
var createSeedEntrypoint = (options) => async (context) => {
  const args = context.args;
  if (!options.seedInput.seedToken || args.seedToken !== options.seedInput.seedToken) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "\u521D\u59CB\u5316\u53E3\u4EE4\u65E0\u6548" }
    };
  }
  const store = options.storeFactory(context);
  await store.load?.();
  await store.transaction(() => {
    upsertById(store.admins, options.seedInput.admin);
    for (const product of options.seedInput.products) upsertById(store.products, product);
    for (const coach of options.seedInput.coaches) upsertById(store.coaches, coach);
  });
  return {
    ok: true,
    data: {
      admins: 1,
      products: options.seedInput.products.length,
      coaches: options.seedInput.coaches.length
    }
  };
};
var loadSeedInput = () => require("./seed.json");
var main = async (context) => createSeedEntrypoint({
  storeFactory: createRuntimeStore,
  seedInput: loadSeedInput()
})(context);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createSeedEntrypoint,
  main
});
module.exports = module.exports.main;
