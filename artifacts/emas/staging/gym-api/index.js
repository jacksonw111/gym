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

// emas/functions/gym-api/src/index.ts
var index_exports = {};
__export(index_exports, {
  createGymApiEntrypoint: () => createGymApiEntrypoint,
  main: () => main
});
module.exports = __toCommonJS(index_exports);

// server/gym/index.ts
var import_node_crypto2 = require("node:crypto");

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

// server/gym/appeals.ts
var createAppeal = async (store, input) => store.transaction(() => {
  if (!input.reason.trim()) throw new DomainError("\u7533\u8BC9\u539F\u56E0\u4E0D\u80FD\u4E3A\u7A7A");
  const lesson = store.lessons.find(
    (item) => item.id === input.lessonId && item.memberId === input.memberId
  );
  if (!lesson?.consumedAt || !["completed", "coach_cancelled_consumed"].includes(lesson.status)) {
    throw new DomainError("\u53EA\u6709\u5DF2\u6D88\u8017\u8BFE\u7A0B\u53EF\u4EE5\u7533\u8BC9");
  }
  const elapsed = new Date(input.now).getTime() - new Date(lesson.consumedAt).getTime();
  if (elapsed < 0 || elapsed > 7 * 24 * 60 * 60 * 1e3) {
    throw new DomainError("\u5DF2\u8D85\u8FC7\u4E03\u5929\u7533\u8BC9\u671F");
  }
  if (store.appeals.some((item) => item.lessonId === lesson.id)) {
    throw new DomainError("\u8BE5\u8BFE\u7A0B\u5DF2\u7ECF\u63D0\u4EA4\u8FC7\u7533\u8BC9");
  }
  const appeal = {
    id: store.nextId("appeal"),
    lessonId: lesson.id,
    memberId: input.memberId,
    reason: input.reason.trim(),
    note: input.note,
    createdAt: input.now,
    status: "pending",
    lessonRefunded: false
  };
  store.appeals.push(appeal);
  return appeal;
});
var decideAppeal = async (store, input) => store.transaction(() => {
  if (!input.decisionNote.trim()) throw new DomainError("\u5904\u7406\u8BF4\u660E\u4E0D\u80FD\u4E3A\u7A7A");
  const appeal = store.appeals.find((item) => item.id === input.appealId);
  if (!appeal) throw new DomainError("\u7533\u8BC9\u4E0D\u5B58\u5728");
  if (appeal.status !== "pending") return appeal;
  if (input.decision === "approve") {
    const lesson = store.lessons.find((item) => item.id === appeal.lessonId);
    const membership = store.packages.find((item) => item.id === lesson?.membershipPackageId);
    if (!lesson || !membership || membership.usedLessons < 1) {
      throw new DomainError("\u5DF2\u7528\u8BFE\u65F6\u4E0D\u5B58\u5728");
    }
    membership.availableLessons += 1;
    membership.usedLessons -= 1;
    assertPackageInvariant(membership);
    appeal.status = "approved";
    appeal.lessonRefunded = true;
    appeal.refundedAt = input.now;
    appendLedger(store, {
      packageId: membership.id,
      lessonId: lesson.id,
      operation: "appeal_refund",
      availableDelta: 1,
      lockedDelta: 0,
      usedDelta: -1,
      totalDelta: 0,
      createdAt: input.now,
      actorId: input.adminId,
      note: input.decisionNote.trim()
    });
  } else {
    appeal.status = "rejected";
  }
  appeal.handledBy = input.adminId;
  appeal.handledAt = input.now;
  appeal.decisionNote = input.decisionNote.trim();
  return appeal;
});

// server/gym/auth.ts
var assertCanAccessLesson = (actor, lesson) => {
  if (actor.kind === "admin" || actor.kind === "system") return;
  if (actor.kind === "member" && lesson.memberId === actor.id) return;
  if (actor.kind === "coach" && lesson.coachId === actor.id) return;
  throw new DomainError("\u6CA1\u6709\u6743\u9650\u8BBF\u95EE\u8BE5\u8BFE\u7A0B");
};

// server/gym/lessons.ts
var bookLesson = async (store, input) => store.transaction(() => {
  const previousOperation = store.operations.find(
    (item) => item.requestId === input.requestId && item.action === "bookLesson"
  );
  const duplicate = previousOperation ? store.lessons.find((item) => item.id === previousOperation.entityId) : store.lessons.find(
    (item) => item.memberId === input.memberId && item.requestId === input.requestId
  );
  if (duplicate) return duplicate;
  const coach = store.coaches.find((item) => item.id === input.coachId);
  if (coach?.status !== "active") throw new DomainError("\u6559\u7EC3\u5F53\u524D\u4E0D\u53EF\u9884\u7EA6");
  const slot = store.schedules.find(
    (item) => item.coachId === input.coachId && item.startsAt === input.startsAt && item.open
  );
  if (!slot) throw new DomainError("\u8BE5\u65F6\u6BB5\u672A\u5F00\u653E");
  if (new Date(slot.startsAt).getTime() <= new Date(input.now).getTime()) {
    throw new DomainError("\u4E0D\u80FD\u9884\u7EA6\u5DF2\u5F00\u59CB\u7684\u8BFE\u7A0B");
  }
  const slotKey = `${input.coachId}:${input.startsAt}`;
  const occupied = store.bookingLocks.some((item) => item.slotKey === slotKey) || store.lessons.some(
    (item) => item.coachId === input.coachId && item.startsAt === input.startsAt && item.status === "booked"
  );
  if (occupied) throw new DomainError("\u8BE5\u65F6\u6BB5\u5DF2\u88AB\u9884\u7EA6");
  const membership = store.packages.find((item) => item.id === input.packageId);
  if (!membership || membership.memberId !== input.memberId) {
    throw new DomainError("\u8BFE\u5305\u4E0D\u5B58\u5728");
  }
  if (membership.coachId !== input.coachId) throw new DomainError("\u8BFE\u5305\u4E0E\u6559\u7EC3\u4E0D\u5339\u914D");
  if (membership.availableLessons < 1) throw new DomainError("\u53EF\u7528\u8BFE\u65F6\u4E0D\u8DB3");
  const lesson = {
    id: store.nextId("lesson"),
    requestId: input.requestId,
    memberId: input.memberId,
    coachId: input.coachId,
    membershipPackageId: membership.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status: "booked"
  };
  membership.availableLessons -= 1;
  membership.lockedLessons += 1;
  assertPackageInvariant(membership);
  store.lessons.push(lesson);
  store.bookingLocks.push({
    id: slotKey,
    slotKey,
    coachId: input.coachId,
    startsAt: input.startsAt,
    lessonId: lesson.id
  });
  appendLedger(store, {
    packageId: membership.id,
    lessonId: lesson.id,
    operation: "lock",
    availableDelta: -1,
    lockedDelta: 1,
    usedDelta: 0,
    totalDelta: 0,
    createdAt: input.now,
    actorId: input.memberId
  });
  store.operations.push({
    id: input.requestId,
    requestId: input.requestId,
    action: "bookLesson",
    entityId: lesson.id,
    completedAt: input.now
  });
  return lesson;
});
var getBookedLessonAndPackage = (store, lessonId) => {
  const lesson = store.lessons.find((item) => item.id === lessonId);
  if (!lesson) throw new DomainError("\u8BFE\u7A0B\u4E0D\u5B58\u5728");
  if (lesson.status !== "booked") throw new DomainError("\u7EC8\u6001\u8BFE\u7A0B\u4E0D\u80FD\u518D\u6B21\u8F6C\u6362");
  const membership = store.packages.find((item) => item.id === lesson.membershipPackageId);
  if (!membership) throw new DomainError("\u8BFE\u5305\u4E0D\u5B58\u5728");
  return { lesson, membership };
};
var releaseLockedLesson = (store, lesson, membership, now, actorId) => {
  membership.availableLessons += 1;
  membership.lockedLessons -= 1;
  assertPackageInvariant(membership);
  appendLedger(store, {
    packageId: membership.id,
    lessonId: lesson.id,
    operation: "release",
    availableDelta: 1,
    lockedDelta: -1,
    usedDelta: 0,
    totalDelta: 0,
    createdAt: now,
    actorId
  });
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
var cancelLessonByMember = async (store, memberId, lessonId, now) => store.transaction(() => {
  const { lesson, membership } = getBookedLessonAndPackage(store, lessonId);
  assertCanAccessLesson({ kind: "member", id: memberId }, lesson);
  if (new Date(lesson.startsAt).getTime() - new Date(now).getTime() < 2 * 60 * 60 * 1e3) {
    throw new DomainError("\u5F00\u8BFE\u4E0D\u8DB3\u4E24\u5C0F\u65F6\u4E0D\u80FD\u81EA\u884C\u53D6\u6D88");
  }
  releaseLockedLesson(store, lesson, membership, now, memberId);
  lesson.status = "member_cancelled";
  store.bookingLocks = store.bookingLocks.filter((item) => item.lessonId !== lesson.id);
  return lesson;
});
var cancelLessonByCoach = async (store, coachId, lessonId, consume, now) => store.transaction(() => {
  const { lesson, membership } = getBookedLessonAndPackage(store, lessonId);
  assertCanAccessLesson({ kind: "coach", id: coachId }, lesson);
  if (consume) {
    consumeLockedLesson(store, lesson, membership, now, coachId);
    lesson.status = "coach_cancelled_consumed";
    lesson.consumedAt = now;
  } else {
    releaseLockedLesson(store, lesson, membership, now, coachId);
    lesson.status = "coach_cancelled_released";
  }
  store.bookingLocks = store.bookingLocks.filter((item) => item.lessonId !== lesson.id);
  return lesson;
});
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
var saveFeedback = async (store, memberId, lessonId, feedback, now) => store.transaction(() => {
  const lesson = store.lessons.find((item) => item.id === lessonId);
  if (!lesson || lesson.memberId !== memberId) throw new DomainError("\u8BFE\u7A0B\u4E0D\u5B58\u5728\u6216\u65E0\u6743\u9650");
  if (lesson.status !== "completed") throw new DomainError("\u53EA\u80FD\u8BC4\u4EF7\u5DF2\u5B8C\u6210\u8BFE\u7A0B");
  if (lesson.feedback) throw new DomainError("\u53CD\u9988\u5DF2\u7ECF\u63D0\u4EA4");
  if (feedback.rating !== void 0 && (!Number.isInteger(feedback.rating) || feedback.rating < 1 || feedback.rating > 5)) {
    throw new DomainError("\u661F\u7EA7\u5FC5\u987B\u4E3A1\u52305");
  }
  lesson.feedback = { ...feedback, submittedAt: now };
  return lesson;
});

// server/gym/packages.ts
var createOrder = async (store, input) => store.transaction(() => {
  const duplicate = store.orders.find(
    (item) => item.memberId === input.memberId && item.requestId === input.requestId
  );
  if (duplicate) return duplicate;
  const member = store.users.find((item) => item.id === input.memberId);
  const coach = store.coaches.find((item) => item.id === input.coachId);
  const product = store.products.find((item) => item.id === input.productId);
  if (!member?.roles.includes("member")) throw new DomainError("\u4F1A\u5458\u4E0D\u5B58\u5728");
  if (coach?.status !== "active") throw new DomainError("\u6559\u7EC3\u4E0D\u53EF\u8D2D\u4E70");
  if (product?.status !== "published") throw new DomainError("\u8BFE\u5305\u5546\u54C1\u4E0D\u53EF\u8D2D\u4E70");
  const order = {
    id: input.id ?? store.nextId("order"),
    requestId: input.requestId,
    memberId: input.memberId,
    coachId: input.coachId,
    coachName: coach.name,
    productId: input.productId,
    productSnapshot: {
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      lessonCount: product.lessonCount
    },
    status: "pending",
    createdAt: input.createdAt
  };
  store.orders.push(order);
  return order;
});
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
var adjustBalance = async (store, input) => store.transaction(() => {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new DomainError("\u8C03\u6574\u8BFE\u65F6\u5FC5\u987B\u4E3A\u6574\u6570");
  }
  if (!input.note.trim()) throw new DomainError("\u8C03\u6574\u8BF4\u660E\u4E0D\u80FD\u4E3A\u7A7A");
  const duplicate = store.ledger.find(
    (item) => item.operation === "manual_adjust" && item.note?.endsWith(`(${input.requestId})`)
  );
  const membership = store.packages.find((item) => item.id === input.packageId);
  if (!membership) throw new DomainError("\u8BFE\u5305\u4E0D\u5B58\u5728");
  if (duplicate) return membership;
  if (membership.availableLessons + input.delta < 0) throw new DomainError("\u53EF\u7528\u8BFE\u65F6\u4E0D\u8DB3");
  membership.availableLessons += input.delta;
  membership.totalLessons += input.delta;
  assertPackageInvariant(membership);
  appendLedger(store, {
    packageId: membership.id,
    operation: "manual_adjust",
    availableDelta: input.delta,
    lockedDelta: 0,
    usedDelta: 0,
    totalDelta: input.delta,
    createdAt: input.now,
    actorId: input.adminId,
    note: `${input.note} (${input.requestId})`
  });
  return membership;
});

// server/gym/payment.ts
var createWechatPaymentProvider = (config, fetcher = fetch) => {
  return async (order) => {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ order })
    });
    if (!response.ok) throw new Error("\u5FAE\u4FE1\u652F\u4ED8\u670D\u52A1\u8BF7\u6C42\u5931\u8D25");
    const result = await response.json();
    if (!result || typeof result !== "object") throw new Error("\u5FAE\u4FE1\u652F\u4ED8\u670D\u52A1\u8FD4\u56DE\u65E0\u6548");
    const candidate = result;
    if (typeof candidate.orderId !== "string" || typeof candidate.payment?.timeStamp !== "string" || typeof candidate.payment.nonceStr !== "string" || typeof candidate.payment.package !== "string" || !["MD5", "HMAC-SHA256", "RSA"].includes(candidate.payment.signType ?? "") || typeof candidate.payment.paySign !== "string") {
      throw new Error("\u5FAE\u4FE1\u652F\u4ED8\u670D\u52A1\u8FD4\u56DE\u65E0\u6548");
    }
    return {
      orderId: candidate.orderId,
      payment: candidate.payment
    };
  };
};
var createDevPayment = async (store, environment, input) => {
  if (environment.production) throw new DomainError("\u751F\u4EA7\u73AF\u5883\u7981\u6B62\u6D4B\u8BD5\u652F\u4ED8");
  if (!environment.developmentPaymentsEnabled) throw new DomainError("\u6D4B\u8BD5\u652F\u4ED8\u672A\u5F00\u542F");
  return grantPaidOrder(store, {
    orderId: input.orderId,
    paymentId: `dev-${input.orderId}`,
    paidAt: input.now
  });
};

// server/gym/seed.ts
var import_node_crypto = require("node:crypto");
var hashAdminPassword = (password) => (0, import_node_crypto.createHash)("sha256").update(password).digest("hex");

// server/gym/index.ts
var ApiError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
var asObject = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError("INVALID_REQUEST", "\u8BF7\u6C42\u5185\u5BB9\u683C\u5F0F\u4E0D\u6B63\u786E");
  }
  return payload;
};
var requiredString = (payload, key) => {
  const value = payload[key];
  if (typeof value !== "string" || !value) {
    throw new ApiError("INVALID_REQUEST", `\u7F3A\u5C11\u53C2\u6570\uFF1A${key}`);
  }
  return value;
};
var getCurrentUser = (store, request) => {
  const emasUserId = request.identity?.emasUserId;
  const user = emasUserId ? store.users.find((item) => item.emasUserId === emasUserId) : void 0;
  if (!user) throw new ApiError("UNAUTHORIZED", "\u8BF7\u5148\u767B\u5F55");
  return user;
};
var defaultScheduleSlots = (store, coachId, date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) {
    throw new ApiError("INVALID_REQUEST", "\u65E5\u671F\u683C\u5F0F\u4E0D\u6B63\u786E");
  }
  const slots = [];
  for (let hour = 10; hour < 21; hour += 1) {
    const hourText = String(hour).padStart(2, "0");
    const nextHourText = String(hour + 1).padStart(2, "0");
    const startsAt = `${date}T${hourText}:00:00+08:00`;
    const existing = store.schedules.find(
      (item) => item.coachId === coachId && item.startsAt === startsAt
    );
    slots.push(
      existing ?? {
        id: `slot-${coachId}-${date}-${hourText}`,
        coachId,
        startsAt,
        endsAt: `${date}T${nextHourText}:00:00+08:00`,
        open: true
      }
    );
  }
  return slots;
};
var getCurrentCoach = (store, request) => {
  const user = getCurrentUser(store, request);
  if (!user.roles.includes("coach")) {
    throw new ApiError("UNAUTHORIZED", "\u5F53\u524D\u8D26\u53F7\u6CA1\u6709\u6559\u7EC3\u6743\u9650");
  }
  const coach = store.coaches.find((item) => item.userId === user.id);
  if (coach?.status !== "active") {
    throw new ApiError("UNAUTHORIZED", "\u6559\u7EC3\u8D26\u53F7\u4E0D\u5B58\u5728\u6216\u5DF2\u505C\u7528");
  }
  return coach;
};
var requireAdmin = (store, request, now) => {
  const session = store.sessions.find(
    (item) => item.token === request.authToken && new Date(item.expiresAt) > new Date(now)
  );
  const admin = session ? store.admins.find((item) => item.id === session.adminId) : void 0;
  if (!admin) throw new ApiError("UNAUTHORIZED", "\u7BA1\u7406\u5458\u4F1A\u8BDD\u65E0\u6548\u6216\u5DF2\u8FC7\u671F");
  return admin;
};
var getActorForLesson = (store, request, lessonId) => {
  const user = getCurrentUser(store, request);
  const lesson = store.lessons.find((item) => item.id === lessonId);
  if (lesson?.memberId === user.id && user.roles.includes("member")) {
    return { kind: "member", id: user.id };
  }
  const coach = store.coaches.find((item) => item.userId === user.id);
  if (coach && lesson?.coachId === coach.id && user.roles.includes("coach")) {
    return { kind: "coach", id: coach.id };
  }
  throw new ApiError("UNAUTHORIZED", "\u6CA1\u6709\u6743\u9650\u64CD\u4F5C\u8BE5\u8BFE\u7A0B");
};
var adminDashboard = (store) => ({
  coaches: store.coaches,
  members: store.users.filter((item) => item.roles.includes("member")),
  packages: store.products,
  memberships: store.packages,
  bookings: store.lessons,
  appeals: store.appeals,
  orders: store.orders,
  ledger: store.ledger,
  schedules: store.schedules
});
var errorResponse = (error) => {
  if (error instanceof ApiError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  if (error instanceof DomainError) {
    return { ok: false, error: { code: "DOMAIN_ERROR", message: error.message } };
  }
  console.error("gym-api internal error", error);
  return {
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" }
  };
};
var mutateAdminResource = (store, resource, operation, data) => {
  const value = data && typeof data === "object" ? data : {};
  const collections = {
    coaches: store.coaches,
    members: store.users,
    packages: store.products
  };
  const collection = collections[resource];
  if (operation === "list") return collection;
  const id = typeof value.id === "string" && value.id ? value.id : operation === "save" ? store.nextId(resource.slice(0, -1)) : requiredString(value, "id");
  const existingIndex = collection.findIndex((item) => item.id === id);
  if (operation === "get") {
    const existing = collection[existingIndex];
    if (!existing) throw new DomainError("\u8BB0\u5F55\u4E0D\u5B58\u5728");
    return existing;
  }
  if (operation === "save") {
    if (resource === "coaches") {
      const userId = typeof value.userId === "string" && value.userId ? value.userId : void 0;
      if (userId) {
        const user = store.users.find((item) => item.id === userId);
        if (!user) throw new DomainError("\u5173\u8054\u7684\u5C0F\u7A0B\u5E8F\u7528\u6237\u4E0D\u5B58\u5728");
        const duplicate = store.coaches.find((item) => item.userId === userId && item.id !== id);
        if (duplicate) throw new DomainError("\u8BE5\u5C0F\u7A0B\u5E8F\u7528\u6237\u5DF2\u7ECF\u7ED1\u5B9A\u6559\u7EC3");
        if (!user.roles.includes("coach")) user.roles.push("coach");
      } else {
        delete value.userId;
      }
      if (existingIndex < 0) value.status = "active";
    }
    if (resource === "packages") {
      const coachId = typeof value.coachId === "string" ? value.coachId : "";
      if (!coachId) throw new DomainError("\u8BFE\u65F6\u5305\u5FC5\u987B\u7ED1\u5B9A\u6559\u7EC3");
      if (!store.coaches.some((item) => item.id === coachId)) {
        throw new DomainError("\u7ED1\u5B9A\u7684\u6559\u7EC3\u4E0D\u5B58\u5728");
      }
    }
    const record = { ...cloneJson(value), id };
    if (existingIndex < 0) collection.push(record);
    else {
      collection[existingIndex] = { ...collection[existingIndex], ...record };
    }
    return existingIndex < 0 ? record : collection[existingIndex];
  }
  if (operation === "setStatus") {
    const existing = collection[existingIndex];
    if (!existing) throw new DomainError("\u8BB0\u5F55\u4E0D\u5B58\u5728");
    if (!("status" in existing)) throw new DomainError("\u8BE5\u8D44\u6E90\u4E0D\u652F\u6301\u72B6\u6001\u53D8\u66F4");
    const status = requiredString(value, "status");
    if (resource === "coaches" && !["active", "inactive"].includes(status) || resource === "packages" && !["published", "unpublished"].includes(status)) {
      throw new DomainError("\u72B6\u6001\u503C\u4E0D\u5408\u6CD5");
    }
    Object.assign(existing, { status });
    return existing;
  }
  throw new ApiError("INVALID_REQUEST", "\u4E0D\u652F\u6301\u7684\u7BA1\u7406\u64CD\u4F5C");
};
var handleAdminCrud = (store, payload) => {
  const resource = requiredString(payload, "resource");
  const operation = requiredString(payload, "operation");
  if (resource === "dashboard") {
    if (operation !== "list") throw new ApiError("INVALID_REQUEST", "\u603B\u89C8\u53EA\u652F\u6301\u5217\u8868\u64CD\u4F5C");
    return adminDashboard(store);
  }
  if (!["coaches", "members", "packages"].includes(resource)) {
    throw new ApiError("INVALID_REQUEST", "\u4E0D\u652F\u6301\u7684\u7BA1\u7406\u8D44\u6E90");
  }
  return mutateAdminResource(
    store,
    resource,
    operation,
    payload.data
  );
};
var createRouter = (store, environment, nowProvider = () => (/* @__PURE__ */ new Date()).toISOString()) => {
  return async (request) => {
    try {
      const payload = asObject(request.payload);
      const now = nowProvider();
      switch (request.action) {
        case "bootstrap": {
          const currentUser = request.identity?.emasUserId ? store.users.find((item) => item.emasUserId === request.identity?.emasUserId) : void 0;
          if (!currentUser) {
            return {
              ok: true,
              data: {
                authenticated: false,
                actor: null,
                profile: null,
                roles: [],
                activeRole: null,
                packages: store.products.filter((item) => item.status === "published"),
                coaches: store.coaches.filter((item) => item.status === "active"),
                memberships: [],
                lessons: [],
                appeals: [],
                orders: [],
                coach: { schedule: [], lessons: [] }
              }
            };
          }
          const requestedRole = payload.activeRole;
          const activeRole = (requestedRole === "member" || requestedRole === "coach") && currentUser.roles.includes(requestedRole) ? requestedRole : currentUser.roles[0];
          if (!activeRole) throw new ApiError("UNAUTHORIZED", "\u5F53\u524D\u8D26\u53F7\u6CA1\u6709\u53EF\u7528\u89D2\u8272");
          const coach = activeRole === "coach" ? store.coaches.find((item) => item.userId === currentUser.id) : void 0;
          if (activeRole === "coach" && !coach) {
            throw new ApiError("UNAUTHORIZED", "\u6559\u7EC3\u8D44\u6599\u4E0D\u5B58\u5728");
          }
          const coachLessons = coach ? store.lessons.filter((item) => item.coachId === coach.id).map((lesson) => {
            const member = store.users.find((item) => item.id === lesson.memberId);
            return {
              ...lesson,
              memberName: member?.name ?? "",
              memberPhone: member?.phone ?? ""
            };
          }) : [];
          const actor = {
            kind: activeRole,
            id: activeRole === "coach" ? coach.id : currentUser.id
          };
          return {
            ok: true,
            data: {
              authenticated: true,
              actor,
              profile: currentUser,
              roles: currentUser.roles,
              activeRole,
              packages: store.products.filter((item) => item.status === "published"),
              coaches: store.coaches.filter((item) => item.status === "active"),
              memberships: store.packages.filter((item) => item.memberId === currentUser.id),
              lessons: coach ? coachLessons : store.lessons.filter((item) => item.memberId === currentUser.id),
              appeals: store.appeals.filter(
                (item) => coach ? store.lessons.some(
                  (lesson) => lesson.id === item.lessonId && lesson.coachId === coach.id
                ) : item.memberId === currentUser.id
              ),
              coach: {
                schedule: coach ? store.schedules.filter((item) => item.coachId === coach.id) : [],
                lessons: coachLessons
              },
              orders: store.orders.filter((item) => item.memberId === currentUser.id).map((item) => ({
                id: item.id,
                status: item.status,
                membershipId: item.packageId
              }))
            }
          };
        }
        case "listPackages":
          return { ok: true, data: store.products.filter((item) => item.status === "published") };
        case "listCoaches":
          return { ok: true, data: store.coaches.filter((item) => item.status === "active") };
        case "registerMember": {
          const emasUserId = request.identity?.emasUserId;
          if (!emasUserId) throw new ApiError("UNAUTHORIZED", "\u65E0\u6CD5\u83B7\u53D6\u5FAE\u4FE1\u7528\u6237\u8EAB\u4EFD");
          const name = requiredString(payload, "name").trim();
          const avatarUrl = requiredString(payload, "avatarUrl");
          const phoneCode = typeof payload.phoneCode === "string" ? payload.phoneCode : void 0;
          const manualPhone = typeof payload.phone === "string" ? payload.phone.trim() : void 0;
          if (name.length < 1 || name.length > 32) {
            throw new ApiError("INVALID_REQUEST", "\u6635\u79F0\u957F\u5EA6\u5E94\u4E3A 1\u201432 \u4E2A\u5B57\u7B26");
          }
          if (!avatarUrl.startsWith("https://")) {
            throw new ApiError("INVALID_REQUEST", "\u5934\u50CF\u5FC5\u987B\u6765\u81EA\u5F53\u524D\u4E91\u5B58\u50A8");
          }
          if (Boolean(phoneCode) === Boolean(manualPhone)) {
            throw new ApiError("INVALID_REQUEST", "\u8BF7\u9009\u62E9\u5FAE\u4FE1\u6388\u6743\u6216\u624B\u52A8\u586B\u5199\u624B\u673A\u53F7");
          }
          if (manualPhone && !/^1[3-9]\d{9}$/.test(manualPhone)) {
            throw new ApiError("INVALID_REQUEST", "\u624B\u673A\u53F7\u683C\u5F0F\u4E0D\u6B63\u786E");
          }
          if (phoneCode && !environment.resolvePhoneNumber) {
            throw new ApiError("SERVICE_UNAVAILABLE", "\u624B\u673A\u53F7\u6388\u6743\u670D\u52A1\u672A\u914D\u7F6E");
          }
          const phone = phoneCode ? await environment.resolvePhoneNumber?.(phoneCode) : manualPhone;
          if (!phone) throw new ApiError("INVALID_REQUEST", "\u624B\u673A\u53F7\u4E0D\u80FD\u4E3A\u7A7A");
          const phoneVerified = Boolean(phoneCode);
          const user = await store.transaction(() => {
            const existing = store.users.find((item) => item.emasUserId === emasUserId);
            if (existing) {
              existing.name = name;
              existing.avatarUrl = avatarUrl;
              existing.phone = phone;
              existing.phoneVerified = phoneVerified;
              if (!existing.roles.includes("member")) existing.roles.push("member");
              return existing;
            }
            const created = {
              id: store.nextId("user"),
              emasUserId,
              name,
              avatarUrl,
              phone,
              phoneVerified,
              roles: ["member"]
            };
            store.users.push(created);
            return created;
          });
          return { ok: true, data: user };
        }
        case "getSchedule": {
          const coachId = requiredString(payload, "coachId");
          const coach = store.coaches.find(
            (item) => item.id === coachId && item.status === "active"
          );
          if (!coach) throw new ApiError("NOT_FOUND", "\u6559\u7EC3\u4E0D\u5B58\u5728\u6216\u5DF2\u505C\u7528");
          const requestedDate = typeof payload.date === "string" ? payload.date : void 0;
          if (requestedDate) {
            await store.transaction(() => {
              const slots = defaultScheduleSlots(store, coachId, requestedDate);
              for (const slot of slots) {
                if (!store.schedules.some((item) => item.id === slot.id)) {
                  store.schedules.push(slot);
                }
              }
            });
          }
          const currentUser = request.identity?.emasUserId ? store.users.find((item) => item.emasUserId === request.identity?.emasUserId) : void 0;
          const currentCoach = currentUser?.roles.includes("coach") ? store.coaches.find(
            (item) => item.userId === currentUser.id && item.id === coachId && item.status === "active"
          ) : void 0;
          return {
            ok: true,
            data: store.schedules.filter(
              (item) => item.coachId === coachId && (!requestedDate || item.startsAt.startsWith(requestedDate)) && (payload.includeClosed === true || item.open)
            ).map((slot) => {
              const lesson = store.lessons.find(
                (item) => item.coachId === slot.coachId && item.startsAt === slot.startsAt && item.status === "booked"
              );
              const member = currentCoach ? store.users.find((item) => item.id === lesson?.memberId) : void 0;
              return {
                ...slot,
                occupied: Boolean(lesson),
                ...lesson && lesson.memberId === currentUser?.id ? { lessonId: lesson.id } : {},
                ...currentCoach && lesson ? {
                  lessonId: lesson.id,
                  memberName: member?.name ?? "",
                  memberPhone: member?.phone ?? ""
                } : {}
              };
            })
          };
        }
        case "purchase": {
          const member = getCurrentUser(store, request);
          const productId = requiredString(payload, "productId");
          const boundCoachId = store.products.find((item) => item.id === productId)?.coachId;
          const coachId = boundCoachId ?? (typeof payload.coachId === "string" && payload.coachId ? payload.coachId : void 0);
          if (!coachId) throw new ApiError("INVALID_REQUEST", "\u7F3A\u5C11\u53C2\u6570\uFF1AcoachId");
          const order = await createOrder(store, {
            requestId: request.requestId,
            memberId: member.id,
            coachId,
            productId,
            createdAt: now
          });
          if (!environment.createPaymentParameters) {
            if (!environment.production && environment.developmentPaymentsEnabled) {
              return { ok: true, data: { order, testPayment: true } };
            }
            throw new Error("\u5FAE\u4FE1\u652F\u4ED8\u670D\u52A1\u5C1A\u672A\u914D\u7F6E");
          }
          const paymentOrder = await environment.createPaymentParameters(order);
          if (paymentOrder.orderId !== order.id) throw new Error("\u652F\u4ED8\u8BA2\u5355\u6821\u9A8C\u5931\u8D25");
          return {
            ok: true,
            data: { order, payment: paymentOrder.payment }
          };
        }
        case "createDevPayment": {
          const member = getCurrentUser(store, request);
          const orderId = requiredString(payload, "orderId");
          const order = store.orders.find((item) => item.id === orderId);
          if (order?.memberId !== member.id) throw new ApiError("UNAUTHORIZED", "\u4E0D\u80FD\u652F\u4ED8\u4ED6\u4EBA\u8BA2\u5355");
          return {
            ok: true,
            data: await createDevPayment(store, environment, { orderId, now })
          };
        }
        case "bookLesson": {
          const member = getCurrentUser(store, request);
          return {
            ok: true,
            data: await bookLesson(store, {
              memberId: member.id,
              coachId: requiredString(payload, "coachId"),
              packageId: requiredString(payload, "packageId"),
              startsAt: requiredString(payload, "startsAt"),
              requestId: request.requestId,
              now
            })
          };
        }
        case "cancelLesson": {
          const member = getCurrentUser(store, request);
          return {
            ok: true,
            data: await cancelLessonByMember(
              store,
              member.id,
              requiredString(payload, "lessonId"),
              now
            )
          };
        }
        case "completeLesson": {
          const lessonId = requiredString(payload, "lessonId");
          return {
            ok: true,
            data: await completeLesson(store, {
              actor: getActorForLesson(store, request, lessonId),
              lessonId,
              now
            })
          };
        }
        case "saveFeedback": {
          const member = getCurrentUser(store, request);
          return {
            ok: true,
            data: await saveFeedback(
              store,
              member.id,
              requiredString(payload, "lessonId"),
              {
                rating: payload.rating,
                comment: typeof payload.comment === "string" ? payload.comment : void 0
              },
              now
            )
          };
        }
        case "createAppeal": {
          const member = getCurrentUser(store, request);
          return {
            ok: true,
            data: await createAppeal(store, {
              memberId: member.id,
              lessonId: requiredString(payload, "lessonId"),
              reason: requiredString(payload, "reason"),
              note: typeof payload.note === "string" ? payload.note : void 0,
              now
            })
          };
        }
        case "setSchedule": {
          const coach = getCurrentCoach(store, request);
          const date = requiredString(payload, "date");
          const slots = payload.slots;
          if (!Array.isArray(slots)) throw new ApiError("INVALID_REQUEST", "\u6392\u73ED\u5185\u5BB9\u683C\u5F0F\u4E0D\u6B63\u786E");
          return {
            ok: true,
            data: await store.transaction(() => {
              const updatedSlots = slots.map((slot) => {
                const value = asObject(slot);
                const startsAt = requiredString(value, "startsAt");
                const endsAt = requiredString(value, "endsAt");
                const open = value.open;
                const match = startsAt.match(
                  new RegExp(`^${date}T(\\d{2}):00:00(?:\\.000)?\\+08:00$`)
                );
                const hour = match ? Number(match[1]) : Number.NaN;
                if (open !== true && open !== false || !match || hour < 10 || hour >= 21 || Date.parse(endsAt) - Date.parse(startsAt) !== 60 * 60 * 1e3) {
                  throw new ApiError("INVALID_REQUEST", "\u6392\u73ED\u65F6\u6BB5\u5FC5\u987B\u662F 10:00\u201421:00 \u7684\u6574\u70B9\u4E00\u5C0F\u65F6");
                }
                const existing = store.schedules.find(
                  (item) => item.coachId === coach.id && item.startsAt === startsAt
                );
                if (existing) {
                  existing.endsAt = endsAt;
                  existing.open = open;
                  return existing;
                }
                const created = {
                  id: `slot-${coach.id}-${date}-${String(hour).padStart(2, "0")}`,
                  coachId: coach.id,
                  startsAt,
                  endsAt,
                  open
                };
                store.schedules.push(created);
                return created;
              });
              return updatedSlots;
            })
          };
        }
        case "coachCancel": {
          const coach = getCurrentCoach(store, request);
          return {
            ok: true,
            data: await cancelLessonByCoach(
              store,
              coach.id,
              requiredString(payload, "lessonId"),
              payload.consume === true,
              now
            )
          };
        }
        case "adminLogin": {
          const username = requiredString(payload, "username");
          const password = requiredString(payload, "password");
          const admin = store.admins.find(
            (item) => item.username === username && item.passwordHash === hashAdminPassword(password)
          );
          if (!admin) throw new ApiError("UNAUTHORIZED", "\u7BA1\u7406\u5458\u8D26\u53F7\u6216\u5BC6\u7801\u9519\u8BEF");
          const session = {
            id: store.nextId("session"),
            token: (0, import_node_crypto2.randomUUID)(),
            adminId: admin.id,
            expiresAt: new Date(new Date(now).getTime() + 8 * 60 * 60 * 1e3).toISOString()
          };
          await store.transaction(() => store.sessions.push(session));
          return { ok: true, data: session };
        }
        case "adminCrud": {
          requireAdmin(store, request, now);
          return {
            ok: true,
            data: await store.transaction(() => handleAdminCrud(store, payload))
          };
        }
        case "listBookings": {
          if (request.authToken) {
            requireAdmin(store, request, now);
            return { ok: true, data: store.lessons };
          }
          const user = getCurrentUser(store, request);
          const coach = store.coaches.find((item) => item.userId === user.id);
          return {
            ok: true,
            data: store.lessons.filter(
              (item) => item.memberId === user.id || item.coachId === coach?.id
            )
          };
        }
        case "listAppeals":
          requireAdmin(store, request, now);
          return { ok: true, data: store.appeals };
        case "decideAppeal": {
          const admin = requireAdmin(store, request, now);
          return {
            ok: true,
            data: await decideAppeal(store, {
              appealId: requiredString(payload, "appealId"),
              decision: payload.decision === "approve" ? "approve" : "reject",
              decisionNote: requiredString(payload, "decisionNote"),
              adminId: admin.id,
              now
            })
          };
        }
        case "adjustBalance": {
          const admin = requireAdmin(store, request, now);
          return {
            ok: true,
            data: await adjustBalance(store, {
              packageId: requiredString(payload, "packageId"),
              delta: Number(payload.delta),
              note: requiredString(payload, "note"),
              requestId: request.requestId,
              adminId: admin.id,
              now
            })
          };
        }
        default:
          throw new ApiError("UNKNOWN_ACTION", `\u4E0D\u652F\u6301\u7684\u64CD\u4F5C\uFF1A${request.action}`);
      }
    } catch (error) {
      return errorResponse(error);
    }
  };
};
var createGymHandler = (store, environment, getServerIdentity) => {
  const router = createRouter(store, environment);
  return async (event) => {
    try {
      await store.load?.();
      const serverIdentity = await getServerIdentity();
      return router({
        ...event,
        identity: serverIdentity?.emasUserId ? { emasUserId: serverIdentity.emasUserId } : void 0
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
};

// server/gym/emas-context.ts
var getEmasIdentity = async (context) => {
  let response;
  try {
    response = await context.mpserverless.user.getInfo();
  } catch {
    return void 0;
  }
  const userId = response?.user?.userId ?? response?.result?.user?.userId;
  return typeof userId === "string" && userId ? { emasUserId: userId } : void 0;
};

// server/gym/store-emas.ts
var import_node_crypto3 = require("node:crypto");
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
    return `${prefix}-${(0, import_node_crypto3.randomUUID)()}`;
  }
};

// server/gym/wechat-phone.ts
var asObject2 = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var createWechatPhoneResolver = (httpClient, credentials, now = Date.now) => {
  let accessToken;
  let accessTokenExpiresAt = 0;
  const getAccessToken = async () => {
    if (accessToken && now() < accessTokenExpiresAt) return accessToken;
    const response = await httpClient.request(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(credentials.appId)}&secret=${encodeURIComponent(credentials.appSecret)}`,
      { method: "GET", dataType: "json" }
    );
    const data = asObject2(response.data);
    if (response.status !== 200 || typeof data.access_token !== "string") {
      throw new Error("\u624B\u673A\u53F7\u6388\u6743\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
    }
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 7200;
    accessToken = data.access_token;
    accessTokenExpiresAt = now() + Math.max(0, expiresIn - 60) * 1e3;
    return accessToken;
  };
  return async (code) => {
    const token = await getAccessToken();
    const response = await httpClient.request(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        data: { code },
        contentType: "json",
        dataType: "json"
      }
    );
    const data = asObject2(response.data);
    const phoneInfo = asObject2(data.phone_info);
    const phoneNumber = phoneInfo.phoneNumber;
    if (response.status !== 200 || data.errcode !== 0 || typeof phoneNumber !== "string" || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
      throw new Error("\u624B\u673A\u53F7\u6388\u6743\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
    }
    return phoneNumber;
  };
};

// emas/functions/runtime.ts
var createRuntimeStore = (context) => new EmasStore(context.mpserverless.db);
var loadRuntimeSecrets = () => require("./secrets.json");
var asPaymentFetch = (httpClient) => {
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
var createRuntimeEnvironment = (context, secrets) => {
  const environment = {
    production: secrets.production !== false,
    developmentPaymentsEnabled: secrets.developmentPaymentsEnabled === true
  };
  if (secrets.wechatAppId && secrets.wechatAppSecret) {
    environment.resolvePhoneNumber = createWechatPhoneResolver(
      context.httpclient,
      {
        appId: secrets.wechatAppId,
        appSecret: secrets.wechatAppSecret
      }
    );
  }
  if (secrets.paymentCreateEndpoint && secrets.paymentApiToken) {
    environment.createPaymentParameters = createWechatPaymentProvider(
      {
        endpoint: secrets.paymentCreateEndpoint,
        apiToken: secrets.paymentApiToken
      },
      asPaymentFetch(context.httpclient)
    );
  }
  return environment;
};

// emas/functions/gym-api/src/index.ts
var createGymApiEntrypoint = (options) => async (context) => {
  const store = options.storeFactory(context);
  const handler = createGymHandler(
    store,
    options.environmentFactory(context),
    () => options.identityProvider(context)
  );
  return handler(context.args);
};
var main = async (context) => {
  const secrets = loadRuntimeSecrets();
  return createGymApiEntrypoint({
    storeFactory: createRuntimeStore,
    environmentFactory: (currentContext) => createRuntimeEnvironment(currentContext, secrets),
    identityProvider: getEmasIdentity
  })(context);
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createGymApiEntrypoint,
  main
});
module.exports = module.exports.main;
