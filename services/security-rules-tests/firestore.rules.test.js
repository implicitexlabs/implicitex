/**
 * IX ID Holder Authority Security Rules — Emulator Tests
 * ========================================================
 * Contract: docs/architecture/ixid-holder-authority-v0.1.md §5.8 (Direct-Firestore authority invariant)
 * Exit gate: Loop 20 / Falsification F-10
 *
 * Frozen invariant:
 *   Browser and Firebase-authenticated clients must not be able to read or write
 *   any Holder Authority collection directly. All access must flow through
 *   ixid-holder-edge → ixid-holder-authority.
 *
 * This suite proves, for EACH of the six authority collections, that both:
 *   - An UNAUTHENTICATED client request is denied
 *   - A FIREBASE-AUTHENTICATED client request (any user) is also denied
 *
 *   ...for both READ and WRITE operations.
 *
 * Uses @firebase/rules-unit-testing which creates client SDK contexts that are
 * subject to Firestore Security Rules (unlike the Admin SDK, which bypasses them).
 */

const { initializeTestEnvironment, assertFails } = require("@firebase/rules-unit-testing");
const { readFileSync } = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TEST_PROJECT = "ix-id-test";
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const [EMULATOR_HOSTNAME, EMULATOR_PORT_STR] = EMULATOR_HOST.split(":");
const EMULATOR_PORT = parseInt(EMULATOR_PORT_STR, 10);

const RULES_PATH = path.join(__dirname, "..", "firestore.rules");

// ---------------------------------------------------------------------------
// Authority collections under test (§5.8)
// ---------------------------------------------------------------------------

const AUTHORITY_COLLECTIONS = [
  "accounts",
  "auth_identities",
  "holder_operation_receipts",
  "ix_ids",
];

// Subcollections that also must be denied
const AUTHORITY_SUBCOLLECTIONS = [
  { parent: "accounts/test-acct-id", subcollection: "account_events", docId: "test-event-id" },
  { parent: "ix_ids/test-ix-id", subcollection: "ix_id_state_events", docId: "test-event-id" },
];

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

let testEnv;

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST must be set to run Security Rules tests.\n" +
      "Example: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test"
    );
  }

  const rulesContent = readFileSync(RULES_PATH, "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: TEST_PROJECT,
    firestore: {
      rules: rulesContent,
      host: EMULATOR_HOSTNAME,
      port: EMULATOR_PORT,
    },
  });
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Helper: get Firestore instances for different auth contexts
// ---------------------------------------------------------------------------

function unauthenticatedFirestore() {
  return testEnv.unauthenticatedContext().firestore();
}

function authenticatedFirestore(uid = "test-authenticated-user") {
  return testEnv.authenticatedContext(uid, {
    firebase: {
      identities: {},
      sign_in_provider: "password",
    },
  }).firestore();
}

// ---------------------------------------------------------------------------
// READ denial tests — top-level authority collections
// ---------------------------------------------------------------------------

describe("READ denied — unauthenticated client", () => {
  for (const collection of AUTHORITY_COLLECTIONS) {
    test(`${collection}/{docId} — unauthenticated read denied`, async () => {
      const db = unauthenticatedFirestore();
      const docRef = db.collection(collection).doc("test-doc-id");
      await assertFails(docRef.get());
    });
  }
});

describe("READ denied — Firebase-authenticated client", () => {
  for (const collection of AUTHORITY_COLLECTIONS) {
    test(`${collection}/{docId} — authenticated read denied`, async () => {
      const db = authenticatedFirestore();
      const docRef = db.collection(collection).doc("test-doc-id");
      await assertFails(docRef.get());
    });
  }
});

// ---------------------------------------------------------------------------
// WRITE denial tests — top-level authority collections
// ---------------------------------------------------------------------------

describe("WRITE denied — unauthenticated client", () => {
  for (const collection of AUTHORITY_COLLECTIONS) {
    test(`${collection}/{docId} — unauthenticated write denied`, async () => {
      const db = unauthenticatedFirestore();
      const docRef = db.collection(collection).doc("test-doc-id");
      await assertFails(docRef.set({ test: true }));
    });
  }
});

describe("WRITE denied — Firebase-authenticated client", () => {
  for (const collection of AUTHORITY_COLLECTIONS) {
    test(`${collection}/{docId} — authenticated write denied`, async () => {
      const db = authenticatedFirestore();
      const docRef = db.collection(collection).doc("test-doc-id");
      await assertFails(docRef.set({ test: true }));
    });
  }
});

// ---------------------------------------------------------------------------
// READ denial tests — subcollections
// ---------------------------------------------------------------------------

describe("READ denied — subcollections — unauthenticated client", () => {
  for (const { parent, subcollection, docId } of AUTHORITY_SUBCOLLECTIONS) {
    test(`${parent}/${subcollection}/${docId} — unauthenticated read denied`, async () => {
      const db = unauthenticatedFirestore();
      const [parentColl, parentDocId] = parent.split("/");
      const docRef = db
        .collection(parentColl)
        .doc(parentDocId)
        .collection(subcollection)
        .doc(docId);
      await assertFails(docRef.get());
    });
  }
});

describe("READ denied — subcollections — Firebase-authenticated client", () => {
  for (const { parent, subcollection, docId } of AUTHORITY_SUBCOLLECTIONS) {
    test(`${parent}/${subcollection}/${docId} — authenticated read denied`, async () => {
      const db = authenticatedFirestore();
      const [parentColl, parentDocId] = parent.split("/");
      const docRef = db
        .collection(parentColl)
        .doc(parentDocId)
        .collection(subcollection)
        .doc(docId);
      await assertFails(docRef.get());
    });
  }
});

// ---------------------------------------------------------------------------
// WRITE denial tests — subcollections
// ---------------------------------------------------------------------------

describe("WRITE denied — subcollections — unauthenticated client", () => {
  for (const { parent, subcollection, docId } of AUTHORITY_SUBCOLLECTIONS) {
    test(`${parent}/${subcollection}/${docId} — unauthenticated write denied`, async () => {
      const db = unauthenticatedFirestore();
      const [parentColl, parentDocId] = parent.split("/");
      const docRef = db
        .collection(parentColl)
        .doc(parentDocId)
        .collection(subcollection)
        .doc(docId);
      await assertFails(docRef.set({ test: true }));
    });
  }
});

describe("WRITE denied — subcollections — Firebase-authenticated client", () => {
  for (const { parent, subcollection, docId } of AUTHORITY_SUBCOLLECTIONS) {
    test(`${parent}/${subcollection}/${docId} — authenticated write denied`, async () => {
      const db = authenticatedFirestore();
      const [parentColl, parentDocId] = parent.split("/");
      const docRef = db
        .collection(parentColl)
        .doc(parentDocId)
        .collection(subcollection)
        .doc(docId);
      await assertFails(docRef.set({ test: true }));
    });
  }
});

// ---------------------------------------------------------------------------
// Verify write-only tests are insufficient (READ is also required)
// §5.8: "Write-only denial tests are insufficient."
// These are the same READ tests as above, renamed for gate-documentation purposes.
// ---------------------------------------------------------------------------

describe("Completeness: both READ and WRITE denied (not write-only)", () => {
  test("accounts read is denied (not just write)", async () => {
    const db = authenticatedFirestore();
    await assertFails(db.collection("accounts").doc("any").get());
  });

  test("ix_ids read is denied (not just write)", async () => {
    const db = authenticatedFirestore();
    await assertFails(db.collection("ix_ids").doc("any").get());
  });

  test("auth_identities read is denied (not just write)", async () => {
    const db = authenticatedFirestore();
    await assertFails(db.collection("auth_identities").doc("any").get());
  });

  test("holder_operation_receipts read is denied (not just write)", async () => {
    const db = authenticatedFirestore();
    await assertFails(db.collection("holder_operation_receipts").doc("any").get());
  });
});
