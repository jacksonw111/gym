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

// emas/functions/wechat-payment-notify/src/index.ts
var index_exports = {};
__export(index_exports, {
  createPaymentNotifyEntrypoint: () => createPaymentNotifyEntrypoint,
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

// server/gym/packages.ts
var grantPaidOrder = async (store, input) => store.transaction(() => {
  const order = store.orders.find((item) => item.id === input.orderId);
  if (!order) throw new DomainError("\u8BA2\u5355\u4E0D\u5B58\u5728");
  if (order.status === "paid" && order.packageId) {
    const existing = store.packages.find((item) => item.id === order.packageId);
    if (!existing) throw new DomainError("\u8BA2\u5355\u8BFE\u5305\u4E0D\u5B58\u5728");
    return existing;
  }
  const duplicatePayment = store.orders.find(
    (item) => item.paymentId === input.paymentId && item.id !== order.id
  );
  if (duplicatePayment) throw new DomainError("\u652F\u4ED8\u5355\u5DF2\u5904\u7406");
  const membership = {
    id: store.nextId("package"),
    memberId: order.memberId,
    coachId: order.coachId,
    coachName: order.coachName,
    productId: order.productSnapshot.id,
    productName: order.productSnapshot.name,
    purchasePriceCents: order.productSnapshot.priceCents,
    totalLessons: order.productSnapshot.lessonCount,
    availableLessons: order.productSnapshot.lessonCount,
    lockedLessons: 0,
    usedLessons: 0,
    purchasedAt: input.paidAt
  };
  assertPackageInvariant(membership);
  store.packages.push(membership);
  order.status = "paid";
  order.paymentId = input.paymentId;
  order.paidAt = input.paidAt;
  order.packageId = membership.id;
  appendLedger(store, {
    packageId: membership.id,
    operation: "purchase",
    availableDelta: membership.totalLessons,
    lockedDelta: 0,
    usedDelta: 0,
    totalDelta: membership.totalLessons,
    createdAt: input.paidAt
  });
  return membership;
});

// server/gym/payment.ts
var createPaymentNotificationHandler = (store, verifier) => {
  return async (notification) => {
    if (!verifier) throw new DomainError("\u5FAE\u4FE1\u652F\u4ED8\u5546\u6237\u9A8C\u8BC1\u670D\u52A1\u672A\u914D\u7F6E");
    const verified = await verifier.verify(notification);
    return grantPaidOrder(store, verified);
  };
};
var createRemoteWechatNotificationVerifier = (config, fetcher = fetch) => ({
  async verify(notification) {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(notification)
    });
    if (!response.ok) throw new DomainError("\u5FAE\u4FE1\u652F\u4ED8\u5E73\u53F0\u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25");
    const result = await response.json();
    if (!result || typeof result !== "object") {
      throw new Error("\u5FAE\u4FE1\u652F\u4ED8\u9A8C\u8BC1\u670D\u52A1\u8FD4\u56DE\u65E0\u6548");
    }
    const candidate = result;
    if (typeof candidate.orderId !== "string" || typeof candidate.paymentId !== "string" || typeof candidate.paidAt !== "string") {
      throw new Error("\u5FAE\u4FE1\u652F\u4ED8\u9A8C\u8BC1\u670D\u52A1\u8FD4\u56DE\u65E0\u6548");
    }
    return candidate;
  }
});

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
var loadRuntimeSecrets = () => require("./secrets.json");
var composedJsonResponse = (statusCode, body, headers = {}) => ({
  mpserverlessComposedResponse: true,
  isBase64Encoded: false,
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    ...headers
  },
  body: JSON.stringify(body)
});
var readHttpBody = (event) => event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : event.body ?? "";

// emas/functions/wechat-payment-notify/src/index.ts
var createPaymentFetch = (httpClient) => {
  return async (url, input) => {
    const response = await httpClient.request(url, {
      method: input.method,
      headers: input.headers,
      data: input.body,
      contentType: "json",
      dataType: "json"
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      json: async () => response.data
    };
  };
};
var createPaymentNotifyEntrypoint = (options) => async (context) => {
  const event = context.args;
  if (event.httpMethod !== "POST") {
    return composedJsonResponse(405, {
      code: "METHOD_NOT_ALLOWED",
      message: "\u53EA\u652F\u6301 POST \u8BF7\u6C42"
    });
  }
  const verifier = options.verifierFactory?.(context);
  if (!verifier) {
    return composedJsonResponse(503, {
      code: "CONFIG_ERROR",
      message: "\u5FAE\u4FE1\u652F\u4ED8\u5546\u6237\u9A8C\u8BC1\u670D\u52A1\u672A\u914D\u7F6E"
    });
  }
  try {
    const store = options.storeFactory(context);
    await store.load?.();
    await createPaymentNotificationHandler(store, verifier)({
      headers: event.headers ?? {},
      body: readHttpBody(event)
    });
    return composedJsonResponse(200, { code: "SUCCESS", message: "\u6210\u529F" });
  } catch (error) {
    if (error instanceof DomainError) {
      return composedJsonResponse(401, {
        code: "VERIFY_FAILED",
        message: error.message
      });
    }
    return composedJsonResponse(500, {
      code: "INTERNAL_ERROR",
      message: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
    });
  }
};
var main = async (context) => {
  const secrets = loadRuntimeSecrets();
  return createPaymentNotifyEntrypoint({
    storeFactory: createRuntimeStore,
    verifierFactory: (currentContext) => secrets.paymentVerifyEndpoint && secrets.paymentApiToken ? createRemoteWechatNotificationVerifier(
      {
        endpoint: secrets.paymentVerifyEndpoint,
        apiToken: secrets.paymentApiToken
      },
      createPaymentFetch(currentContext.httpclient)
    ) : void 0
  })(context);
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createPaymentNotifyEntrypoint,
  main
});
module.exports = module.exports.main;
