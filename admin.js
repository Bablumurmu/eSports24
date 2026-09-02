import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  serverTimestamp,
  deleteDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id =>
  document.getElementById(id);

let unsubTournaments = null;
let unsubPlayers = null;
let unsubDeposits = null;

/* =========================================================
   HELPERS
========================================================= */

function toast(message) {
  const el = $("toast");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent =
    String(message || "");

  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2500);
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char])
  );
}

function isHttpUrl(value) {
  try {
    const url =
      new URL(
        String(value || "").trim()
      );

    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatDate(value) {
  if (!value) return "—";

  let date;

  if (
    value &&
    typeof value.toDate === "function"
  ) {
    date = value.toDate();
  } else {
    date = new Date(value);
  }

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleString(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );
}

async function isAdmin(uid) {
  if (!uid) return false;

  const snap =
    await getDoc(
      doc(
        db,
        "users",
        uid
      )
    );

  return (
    snap.exists() &&
    snap.data()?.role === "admin"
  );
}

/* =========================================================
   AUTH
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    try {

      if (!user) {

        if ($("dashboard")) {
          $("dashboard").hidden =
            true;
        }

        if ($("adminLoginCard")) {
          $("adminLoginCard").hidden =
            false;
        }

        return;
      }

      const admin =
        await isAdmin(
          user.uid
        );

      if (!admin) {

        toast(
          "Not authorized as admin."
        );

        await signOut(auth);

        return;
      }

      if ($("adminLoginCard")) {
        $("adminLoginCard").hidden =
          true;
      }

      if ($("dashboard")) {
        $("dashboard").hidden =
          false;
      }

      await loadAdmin();

    } catch (error) {

      console.error(
        "Admin authentication error:",
        error
      );

      toast(
        error.message ||
        "Unable to verify admin account."
      );
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

$("adminLoginForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    try {

      const email =
        $("adminEmail")
          .value
          .trim();

      const password =
        $("adminPassword")
          .value;

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

    } catch (error) {

      console.error(error);

      toast(
        error.message ||
        "Admin login failed."
      );
    }
  }
);

/* =========================================================
   LOGOUT
========================================================= */

$("adminLogout")?.addEventListener(
  "click",
  async () => {

    try {

      await signOut(auth);

    } catch (error) {

      console.error(error);

      toast(
        error.message ||
        "Logout failed."
      );
    }
  }
);

/* =========================================================
   LOAD ADMIN
========================================================= */

async function loadAdmin() {

  await loadSettings();

  setupTournamentForm();

  setupRoomForm();

  setupManualAddMoney();

  loadTournaments();

  loadPlayers();

  loadDeposits();
}

/* =========================================================
   SETTINGS
========================================================= */

async function loadSettings() {

  try {

    const ref =
      doc(
        db,
        "adminSettings",
        "public"
      );

    const snap =
      await getDoc(ref);

    const data =
      snap.exists()
        ? snap.data()
        : {};

    if ($("logoUrl")) {
      $("logoUrl").value =
        data.logoUrl || "";
    }

    if ($("splashUrl")) {
      $("splashUrl").value =
        data.splashUrl || "";
    }

    if ($("qrUrl")) {
      $("qrUrl").value =
        data.qrUrl || "";
    }

  } catch (error) {

    console.error(
      "Settings load error:",
      error
    );

    toast(
      "Unable to load settings."
    );
  }

  $("settingsForm")?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      try {

        if (!auth.currentUser) {
          throw new Error(
            "Admin session expired."
          );
        }

        const logo =
          $("logoUrl")
            ?.value
            .trim() || "";

        const splash =
          $("splashUrl")
            ?.value
            .trim() || "";

        const qr =
          $("qrUrl")
            ?.value
            .trim() || "";

        if (
          logo &&
          !isHttpUrl(logo)
        ) {
          throw new Error(
            "Logo must be a valid HTTPS URL."
          );
        }

        if (
          splash &&
          !isHttpUrl(splash)
        ) {
          throw new Error(
            "Splash must be a valid HTTPS URL."
          );
        }

        if (
          qr &&
          !isHttpUrl(qr)
        ) {
          throw new Error(
            "Payment QR must be a valid HTTPS URL."
          );
        }

        const uid =
          auth.currentUser.uid;

        if (
          !(await isAdmin(uid))
        ) {
          throw new Error(
            "Admin verification failed."
          );
        }

        await setDoc(
          doc(
            db,
            "adminSettings",
            "public"
          ),
          {
            logoUrl: logo,
            splashUrl: splash,
            qrUrl: qr,
            updatedAt:
              serverTimestamp(),
            updatedBy: uid
          },
          { merge: true }
        );

        toast(
          "Settings saved successfully."
        );

      } catch (error) {

        console.error(error);

        toast(
          error.message ||
          "Settings save failed."
        );
      }
    }
  );
}

/* =========================================================
   FREE / PAID
========================================================= */

function setupTournamentForm() {

  $("tFree")?.addEventListener(
    "change",
    () => {

      const free =
        $("tFree").value ===
        "true";

      if ($("tFee")) {

        $("tFee").disabled =
          free;

        if (free) {
          $("tFee").value = 0;
        }
      }
    }
  );

  $("tournamentForm")?.addEventListener(
    "submit",
    createTournament
  );
}

/* =========================================================
   CREATE TOURNAMENT
========================================================= */

async function createTournament(event) {

  event.preventDefault();

  try {

    if (!auth.currentUser) {
      throw new Error(
        "Admin session expired."
      );
    }

    if (
      !(await isAdmin(
        auth.currentUser.uid
      ))
    ) {
      throw new Error(
        "Admin verification failed."
      );
    }

    const name =
      $("tName")
        ?.value
        .trim() || "";

    const imageUrl =
      $("tImage")
        ?.value
        .trim() || "";

    const mode =
      $("tMode")
        ?.value || "Squad";

    const isFree =
      $("tFree")
        ?.value === "true";

    const entryFee =
      Number(
        $("tFee")
          ?.value || 0
      );

    const totalSlots =
      Number(
        $("tSlots")
          ?.value || 0
      );

    const perKill =
      Number(
        $("tKill")
          ?.value || 0
      );

    const registrationEnd =
      $("tReg")
        ?.value || "";

    const matchDateTime =
      $("tDate")
        ?.value || "";

    if (!name) {
      throw new Error(
        "Tournament name is required."
      );
    }

    if (
      imageUrl &&
      !isHttpUrl(imageUrl)
    ) {
      throw new Error(
        "Tournament image must be a valid HTTPS URL."
      );
    }

    if (
      !Number.isInteger(totalSlots) ||
      totalSlots <= 0
    ) {
      throw new Error(
        "Total slots must be greater than 0."
      );
    }

    if (
      !Number.isFinite(perKill) ||
      perKill < 0
    ) {
      throw new Error(
        "Invalid per-kill amount."
      );
    }

    if (
      !isFree &&
      (!Number.isFinite(entryFee) ||
        entryFee <= 0)
    ) {
      throw new Error(
        "Enter a valid entry fee."
      );
    }

    const prizes = {};

    const p1 =
      Number(
        $("prize1")
          ?.value || 0
      );

    const p2 =
      Number(
        $("prize2")
          ?.value || 0
      );

    const p3 =
      Number(
        $("prize3")
          ?.value || 0
      );

    if (p1 > 0) {
      prizes["1st"] = p1;
    }

    if (p2 > 0) {
      prizes["2nd"] = p2;
    }

    if (p3 > 0) {
      prizes["3rd"] = p3;
    }

    for (
      let i = 1;
      i <= 5;
      i++
    ) {

      const range =
        $(`prizeRange${i}`)
          ?.value
          ?.trim() || "";

      const amount =
        Number(
          $(`prizeAmount${i}`)
            ?.value || 0
        );

      if (
        range &&
        amount > 0
      ) {
        prizes[range] =
          amount;
      }
    }

    const prizeTotal =
      Object.values(prizes)
        .reduce(
          (sum, value) =>
            sum +
            Number(value || 0),
          0
        );

    await addDoc(
      collection(
        db,
        "tournaments"
      ),
      {
        name,
        imageUrl,
        mode,

        isFree,

        entryFee:
          isFree
            ? 0
            : entryFee,

        totalSlots,
        slots: totalSlots,

        joinedCount: 0,

        perKill,

        registrationEnd:
          registrationEnd || null,

        matchDateTime:
          matchDateTime || null,

        prizes,

        prizeDistribution:
          prizes,

        prizeTotal,

        totalPrize:
          prizeTotal,

        status: "upcoming",

        createdAt:
          serverTimestamp(),

        createdBy:
          auth.currentUser.uid
      }
    );

    toast(
      "Tournament created successfully."
    );

    $("tournamentForm")
      ?.reset();

    if ($("tFree")) {
      $("tFree").value =
        "false";
    }

    if ($("tFee")) {
      $("tFee").disabled =
        false;
    }

  } catch (error) {

    console.error(
      "Create tournament error:",
      error
    );

    toast(
      error.message ||
      "Unable to create tournament."
    );
  }
}

/* =========================================================
   TOURNAMENT LIST
========================================================= */

function loadTournaments() {

  if (unsubTournaments) {
    unsubTournaments();
  }

  const q =
    query(
      collection(
        db,
        "tournaments"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    );

  unsubTournaments =
    onSnapshot(
      q,
      snapshot => {

        const items =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );

        const el =
          $("tournaments");

        if (!el) return;

        if (!items.length) {
          el.innerHTML =
            "<p>No tournaments found.</p>";
          return;
        }

        el.innerHTML =
          items.map(
            item => `
              <div class="admin-card">

                <h3>
                  ${esc(
                    item.name
                  )}
                </h3>

                <div>
                  Entry:
                  ${
                    Number(
                      item.entryFee || 0
                    ) > 0
                      ? `₹${Number(
                          item.entryFee
                        )}`
                      : "FREE"
                  }
                </div>

                <div>
                  Slots:
                  ${Number(
                    item.joinedCount || 0
                  )}/${Number(
                    item.totalSlots ||
                    item.slots ||
                    0
                  )}
                </div>

                <div>
                  Per Kill:
                  ₹${Number(
                    item.perKill || 0
                  )}
                </div>

                <div>
                  Match:
                  ${esc(
                    formatDate(
                      item.matchDateTime
                    )
                  )}
                </div>

                <div
                  style="
                    margin-top:10px;
                    display:flex;
                    gap:8px;
                    flex-wrap:wrap;
                  "
                >

                  <button
                    class="btn danger"
                    data-delete-tournament="${esc(
                      item.id
                    )}"
                  >
                    Delete
                  </button>

                </div>

              </div>
            `
          ).join("");

        el
          .querySelectorAll(
            "[data-delete-tournament]"
          )
          .forEach(
            button => {

              button.onclick =
                () =>
                  deleteTournament(
                    button.dataset
                      .deleteTournament
                  );
            }
          );
      },

      error => {

        console.error(
          "Tournament listener:",
          error
        );

        toast(
          "Unable to load tournaments."
        );
      }
    );
}

/* =========================================================
   DELETE TOURNAMENT
========================================================= */

async function deleteTournament(
  tournamentId
) {

  if (!tournamentId) return;

  if (
    !confirm(
      "Delete this tournament?"
    )
  ) {
    return;
  }

  try {

    await deleteDoc(
      doc(
        db,
        "tournaments",
        tournamentId
      )
    );

    toast(
      "Tournament deleted."
    );

  } catch (error) {

    console.error(error);

    toast(
      error.message ||
      "Unable to delete tournament."
    );
  }
}

/* =========================================================
   PLAYERS
========================================================= */

function loadPlayers() {

  if (unsubPlayers) {
    unsubPlayers();
  }

  unsubPlayers =
    onSnapshot(
      collection(
        db,
        "users"
      ),
      snapshot => {

        const players =
          snapshot.docs
            .map(
              d => ({
                id: d.id,
                ...d.data()
              })
            )
            .filter(
              x =>
                x.role !== "admin"
            );

        const el =
          $("players");

        if (!el) return;

        if (!players.length) {
          el.innerHTML =
            "<p>No players found.</p>";
          return;
        }

        el.innerHTML =
          players.map(
            player => `
              <div class="admin-card">

                <strong>
                  ${esc(
                    player.name ||
                    "Player"
                  )}
                </strong>

                <div>
                  Email:
                  ${esc(
                    player.email ||
                    ""
                  )}
                </div>

                <div>
                  Mobile:
                  ${esc(
                    player.mobile ||
                    ""
                  )}
                </div>

                <div>
                  Wallet:
                  ₹${Number(
                    player.walletBalance ||
                    0
                  ).toFixed(2)}
                </div>

              </div>
            `
          ).join("");
      },

      error => {

        console.error(
          "Players listener:",
          error
        );

        toast(
          "Unable to load players."
        );
      }
    );
}

/* =========================================================
   DEPOSITS
========================================================= */

function loadDeposits() {

  if (unsubDeposits) {
    unsubDeposits();
  }

  const q =
    query(
      collection(
        db,
        "depositRequests"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    );

  unsubDeposits =
    onSnapshot(
      q,
      snapshot => {

        const deposits =
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          );

        const el =
          $("deposits");

        if (!el) return;

        if (!deposits.length) {
          el.innerHTML =
            "<p>No deposit requests.</p>";
          return;
        }

        el.innerHTML =
          deposits.map(
            deposit => {

              const status =
                String(
                  deposit.status ||
                  "pending"
                );

              return `
                <div
                  class="admin-card"
                  style="margin-bottom:12px;"
                >

                  <h3>
                    ₹${Number(
                      deposit.amount ||
                      0
                    )}
                  </h3>

                  <div>
                    Status:
                    <strong>
                      ${esc(status)}
                    </strong>
                  </div>

                  <div>
                    UID:
                    ${esc(
                      deposit.uid ||
                      ""
                    )}
                  </div>

                  <div>
                    Email:
                    ${esc(
                      deposit.email ||
                      ""
                    )}
                  </div>

                  <div>
                    Mobile:
                    ${esc(
                      deposit.mobile ||
                      ""
                    )}
                  </div>

                  <div>
                    UTR:
                    <strong>
                      ${esc(
                        deposit.utr ||
                        ""
                      )}
                    </strong>
                  </div>

                  <div>
                    Created:
                    ${esc(
                      formatDate(
                        deposit.createdAt
                      )
                    )}
                  </div>

                  ${
                    deposit.rejectReason
                      ? `
                        <div>
                          Reject Reason:
                          ${esc(
                            deposit.rejectReason
                          )}
                        </div>
                      `
                      : ""
                  }

                  ${
                    status === "pending"
                      ? `
                        <div
                          style="
                            margin-top:10px;
                            display:flex;
                            gap:8px;
                          "
                        >

                          <button
                            class="btn success"
                            data-approve-deposit="${esc(
                              deposit.id
                            )}"
                          >
                            ✓ Approve
                          </button>

                          <button
                            class="btn danger"
                            data-reject-deposit="${esc(
                              deposit.id
                            )}"
                          >
                            ✕ Reject
                          </button>

                        </div>
                      `
                      : ""
                  }

                </div>
              `;
            }
          ).join("");

        el
          .querySelectorAll(
            "[data-approve-deposit]"
          )
          .forEach(
            button => {

              button.onclick =
                async () => {

                  const id =
                    button.dataset
                      .approveDeposit;

                  if (
                    !confirm(
                      "Approve this deposit and add money to player's wallet?"
                    )
                  ) {
                    return;
                  }

                  button.disabled =
                    true;

                  button.textContent =
                    "Approving...";

                  try {

                    await approveDeposit(
                      id
                    );

                    toast(
                      "Deposit approved and wallet credited."
                    );

                  } catch (error) {

                    console.error(
                      error
                    );

                    button.disabled =
                      false;

                    button.textContent =
                      "✓ Approve";

                    toast(
                      error.message ||
                      "Unable to approve deposit."
                    );
                  }
                };
            }
          );

        el
          .querySelectorAll(
            "[data-reject-deposit]"
          )
          .forEach(
            button => {

              button.onclick =
                async () => {

                  const id =
                    button.dataset
                      .rejectDeposit;

                  const reason =
                    prompt(
                      "Enter rejection reason:"
                    );

                  if (
                    reason === null
                  ) {
                    return;
                  }

                  if (
                    !reason.trim()
                  ) {
                    toast(
                      "Rejection reason is required."
                    );
                    return;
                  }

                  button.disabled =
                    true;

                  button.textContent =
                    "Rejecting...";

                  try {

                    await rejectDeposit(
                      id,
                      reason.trim()
                    );

                    toast(
                      "Deposit rejected."
                    );

                  } catch (error) {

                    console.error(
                      error
                    );

                    button.disabled =
                      false;

                    button.textContent =
                      "✕ Reject";

                    toast(
                      error.message ||
                      "Unable to reject deposit."
                    );
                  }
                };
            }
          );
      },

      error => {

        console.error(
          "Deposit listener:",
          error
        );

        const el =
          $("deposits");

        if (el) {
          el.innerHTML = `
            <p>
              Unable to load deposit requests.
            </p>
          `;
        }
      }
    );
}

/* =========================================================
   APPROVE DEPOSIT
========================================================= */

async function approveDeposit(
  requestId
) {

  if (!auth.currentUser) {
    throw new Error(
      "Admin session expired."
    );
  }

  if (
    !(await isAdmin(
      auth.currentUser.uid
    ))
  ) {
    throw new Error(
      "Admin verification failed."
    );
  }

  const adminUid =
    auth.currentUser.uid;

  const depositRef =
    doc(
      db,
      "depositRequests",
      requestId
    );

  await runTransaction(
    db,
    async transaction => {

      const depositSnap =
        await transaction.get(
          depositRef
        );

      if (
        !depositSnap.exists()
      ) {
        throw new Error(
          "Deposit request not found."
        );
      }

      const deposit =
        depositSnap.data() || {};

      if (
        deposit.status !==
        "pending"
      ) {
        throw new Error(
          `This deposit is already ${deposit.status || "processed"}.`
        );
      }

      const uid =
        String(
          deposit.uid || ""
        ).trim();

      if (!uid) {
        throw new Error(
          "Deposit request has no user ID."
        );
      }

      const amount =
        Number(
          deposit.amount || 0
        );

      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 50000
      ) {
        throw new Error(
          "Invalid deposit amount."
        );
      }

      const userRef =
        doc(
          db,
          "users",
          uid
        );

      const userSnap =
        await transaction.get(
          userRef
        );

      if (
        !userSnap.exists()
      ) {
        throw new Error(
          "Player account not found."
        );
      }

      const userData =
        userSnap.data() || {};

      const oldBalance =
        Number(
          userData.walletBalance ||
          0
        );

      if (
        !Number.isFinite(
          oldBalance
        ) ||
        oldBalance < 0
      ) {
        throw new Error(
          "Invalid player wallet balance."
        );
      }

      const newBalance =
        oldBalance + amount;

      const walletRef =
        doc(
          collection(
            db,
            "walletTransactions"
          )
        );

      transaction.update(
        userRef,
        {
          walletBalance:
            newBalance
        }
      );

      transaction.update(
        depositRef,
        {
          status:
            "approved",

          approvedAt:
            serverTimestamp(),

          approvedBy:
            adminUid,

          updatedAt:
            serverTimestamp()
        }
      );

      transaction.set(
        walletRef,
        {
          uid,

          type:
            "deposit",

          amount,

          balanceBefore:
            oldBalance,

          balanceAfter:
            newBalance,

          status:
            "approved",

          depositRequestId:
            requestId,

          utr:
            String(
              deposit.utr || ""
            ),

          description:
            "Wallet deposit approved",

          createdAt:
            serverTimestamp(),

          createdBy:
            adminUid
        }
      );
    }
  );
}

/* =========================================================
   REJECT DEPOSIT
========================================================= */

async function rejectDeposit(
  requestId,
  reason
) {

  if (!auth.currentUser) {
    throw new Error(
      "Admin session expired."
    );
  }

  if (
    !(await isAdmin(
      auth.currentUser.uid
    ))
  ) {
    throw new Error(
      "Admin verification failed."
    );
  }

  if (!reason) {
    throw new Error(
      "Rejection reason is required."
    );
  }

  const depositRef =
    doc(
      db,
      "depositRequests",
      requestId
    );

  await runTransaction(
    db,
    async transaction => {

      const snap =
        await transaction.get(
          depositRef
        );

      if (!snap.exists()) {
        throw new Error(
          "Deposit request not found."
        );
      }

      const data =
        snap.data() || {};

      if (
        data.status !==
        "pending"
      ) {
        throw new Error(
          `This deposit is already ${data.status || "processed"}.`
        );
      }

      transaction.update(
        depositRef,
        {
          status:
            "rejected",

          rejectReason:
            reason,

          rejectedAt:
            serverTimestamp(),

          rejectedBy:
            auth.currentUser.uid,

          updatedAt:
            serverTimestamp()
        }
      );
    }
  );
}

/* =========================================================
   MANUAL ADD MONEY
   GOOGLE FORM PAYMENT FLOW
========================================================= */

function setupManualAddMoney() {

  const form =
    $("manualAddMoneyForm");

  if (!form) {
    console.warn(
      "Manual Add Money form not found in admin.html"
    );
    return;
  }

  /* Avoid duplicate event listener */

  if (
    form.dataset
      .manualAddMoneyReady ===
    "true"
  ) {
    return;
  }

  form.dataset
    .manualAddMoneyReady =
    "true";

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const button =
        form.querySelector(
          'button[type="submit"]'
        );

      const emailInput =
        $("manualAddMoneyEmail");

      const amountInput =
        $("manualAddMoneyAmount");

      const email =
        emailInput
          ?.value
          ?.trim()
          ?.toLowerCase() || "";

      const amount =
        Number(
          amountInput
            ?.value || 0
        );

      try {

        /* ---------- ADMIN CHECK ---------- */

        if (!auth.currentUser) {
          throw new Error(
            "Admin session expired."
          );
        }

        const adminUid =
          auth.currentUser.uid;

        if (
          !(await isAdmin(
            adminUid
          ))
        ) {
          throw new Error(
            "Admin verification failed."
          );
        }


        /* ---------- VALIDATION ---------- */

        if (!email) {
          throw new Error(
            "Player email is required."
          );
        }

        if (
          !email.includes("@") ||
          !email.includes(".")
        ) {
          throw new Error(
            "Enter a valid player email."
          );
        }

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          throw new Error(
            "Enter a valid amount."
          );
        }

        if (amount > 50000) {
          throw new Error(
            "Maximum manual Add Money amount is ₹50,000."
          );
        }


        /* ---------- BUTTON ---------- */

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "Searching...";
        }


        /* ---------- FIND PLAYER ---------- */

        const playersSnapshot =
          await getDocs(
            collection(
              db,
              "users"
            )
          );

        let playerId =
          null;

        let playerData =
          null;

        playersSnapshot.forEach(
          playerDoc => {

            const data =
              playerDoc.data() ||
              {};

            const playerEmail =
              String(
                data.email || ""
              )
                .trim()
                .toLowerCase();

            if (
              playerEmail ===
                email &&
              data.role !==
                "admin"
            ) {

              playerId =
                playerDoc.id;

              playerData =
                data;

            }
          }
        );


        if (
          !playerId ||
          !playerData
        ) {
          throw new Error(
            "No player account found with this email."
          );
        }


        /* ---------- BALANCE ---------- */

        const playerName =
          playerData.name ||
          "Player";

        const oldBalance =
          Number(
            playerData.walletBalance ||
            0
          );

        if (
          !Number.isFinite(
            oldBalance
          ) ||
          oldBalance < 0
        ) {
          throw new Error(
            "Player wallet balance is invalid."
          );
        }

        const newBalance =
          oldBalance + amount;


        /* ---------- CONFIRM ---------- */

        const confirmed =
          confirm(
            `Add ₹${amount.toFixed(2)} to ${playerName}?\n\n` +
            `Email: ${email}\n` +
            `Current Balance: ₹${oldBalance.toFixed(2)}\n` +
            `New Balance: ₹${newBalance.toFixed(2)}`
          );

        if (!confirmed) {
          return;
        }


        if (button) {
          button.textContent =
            "Adding...";
        }


        /* ---------- FIRESTORE TRANSACTION ---------- */

        const userRef =
          doc(
            db,
            "users",
            playerId
          );

        const walletRef =
          doc(
            collection(
              db,
              "walletTransactions"
            )
          );


        await runTransaction(
          db,
          async transaction => {

            const userSnap =
              await transaction.get(
                userRef
              );

            if (
              !userSnap.exists()
            ) {
              throw new Error(
                "Player account no longer exists."
              );
            }

            const currentData =
              userSnap.data() ||
              {};

            const currentBalance =
              Number(
                currentData.walletBalance ||
                0
              );

            if (
              !Number.isFinite(
                currentBalance
              ) ||
              currentBalance < 0
            ) {
              throw new Error(
                "Invalid current wallet balance."
              );
            }

            const finalBalance =
              currentBalance +
              amount;


            /* Wallet update */

            transaction.update(
              userRef,
              {
                walletBalance:
                  finalBalance
              }
            );


            /* Wallet transaction record */

            transaction.set(
              walletRef,
              {

                uid:
                  playerId,

                type:
                  "deposit",

                amount:
                  amount,

                balanceBefore:
                  currentBalance,

                balanceAfter:
                  finalBalance,

                status:
                  "approved",

                source:
                  "manual_admin",

                method:
                  "google_form",

                playerEmail:
                  email,

                description:
                  "Manual Add Money after Google Form payment verification",

                createdAt:
                  serverTimestamp(),

                createdBy:
                  adminUid

              }
            );

          }
        );


        /* ---------- SUCCESS ---------- */

        toast(
          `₹${amount.toFixed(2)} added successfully to ${email}.`
        );


        /* ---------- RESET ---------- */

        if (emailInput) {
          emailInput.value =
            "";
        }

        if (amountInput) {
          amountInput.value =
            "";
        }


      } catch (error) {

        console.error(
          "Manual Add Money error:",
          error
        );

        toast(
          error.message ||
          "Unable to add money."
        );

      } finally {

        if (button) {

          button.disabled =
            false;

          button.textContent =
            "Add Money";

        }

      }

    }
  );
}


/* =========================================================
   ROOM CREDENTIALS
========================================================= */

function setupRoomForm() {

  $("roomForm")?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      try {

        if (!auth.currentUser) {
          throw new Error(
            "Admin session expired."
          );
        }

        if (
          !(await isAdmin(
            auth.currentUser.uid
          ))
        ) {
          throw new Error(
            "Admin verification failed."
          );
        }

        const tournamentId =
          $("roomTournamentId")
            ?.value
            ?.trim() || "";

        const roomId =
          $("roomId")
            ?.value
            ?.trim() || "";

        const password =
          $("roomPassword")
            ?.value
            ?.trim() || "";

        if (!tournamentId) {
          throw new Error(
            "Tournament ID is required."
          );
        }

        if (!roomId) {
          throw new Error(
            "Room ID is required."
          );
        }

        if (!password) {
          throw new Error(
            "Room password is required."
          );
        }

        await setDoc(
          doc(
            db,
            "roomCredentials",
            tournamentId
          ),
          {
            tournamentId,
            roomId,
            password,
            updatedAt:
              serverTimestamp(),
            updatedBy:
              auth.currentUser.uid
          },
          { merge: true }
        );

        toast(
          "Room credentials saved."
        );

      } catch (error) {

        console.error(error);

        toast(
          error.message ||
          "Unable to save room credentials."
        );
      }
    }
  );
}
