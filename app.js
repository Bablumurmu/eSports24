import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  setDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const $ = id => document.getElementById(id);

let currentUser = null;
let tournaments = [];
let publicSettings = {};
let tournamentUnsubscribe = null;
let myTournamentUnsubscribe = null;
let tournamentsLoaded = false;
let appStarted = false;

/* =========================================================
   HELPERS
========================================================= */

function toast(message) {
  const el = $("toast");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = String(message || "");
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 3000);
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
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function timestampMs(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const n = new Date(value).getTime();
  return Number.isNaN(n) ? 0 : n;
}

function formatDate(value) {
  const ms = timestampMs(value);

  if (!ms) return "—";

  return new Date(ms).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getEntryFee(tournament) {
  return Math.max(
    0,
    Number(
      tournament?.entryFee ??
      tournament?.entry_fee ??
      tournament?.fee ??
      0
    )
  );
}

function getSlots(tournament) {
  return Number(
    tournament?.slots ??
    tournament?.maxSlots ??
    tournament?.totalSlots ??
    0
  );
}

function getJoinedCount(tournament) {
  return Number(tournament?.joinedCount || 0);
}

function getPerKill(tournament) {
  return Number(
    tournament?.perKill ??
    tournament?.perKillPrize ??
    tournament?.killPrize ??
    tournament?.killPrizeAmount ??
    0
  );
}

function getPrizeObject(tournament) {
  return (
    tournament?.prizeDistribution ??
    tournament?.prizes ??
    tournament?.prize ??
    {}
  );
}

function getFirstPrize(tournament) {
  const prize = getPrizeObject(tournament);

  if (Array.isArray(prize)) {
    if (!prize.length) return 0;

    const first = prize[0];

    if (typeof first === "object") {
      return Number(
        first.amount ??
        first.prize ??
        first.value ??
        0
      );
    }

    return Number(first || 0);
  }

  if (typeof prize === "object") {
    return Number(
      prize["1st"] ??
      prize["1"] ??
      prize.first ??
      prize.firstPrize ??
      0
    );
  }

  return Number(prize || 0);
}

function getTotalPrize(tournament) {
  if (tournament?.prizeTotal != null) {
    return Number(tournament.prizeTotal || 0);
  }

  if (tournament?.totalPrize != null) {
    return Number(tournament.totalPrize || 0);
  }

  const prizes = getPrizeObject(tournament);

  if (Array.isArray(prizes)) {
    return prizes.reduce((sum, item) => {
      if (typeof item === "object") {
        return sum + Number(
          item.amount ??
          item.prize ??
          item.value ??
          0
        );
      }

      return sum + Number(item || 0);
    }, 0);
  }

  if (typeof prizes === "object") {
    return Object.values(prizes).reduce(
      (sum, value) => sum + Number(value || 0),
      0
    );
  }

  return 0;
}

/* =========================================================
   MODAL
========================================================= */

function openModal(html) {
  const modal = $("modal");

  if (!modal) {
    alert("Modal element missing in index.html");
    return;
  }

  modal.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-box">
        <button
          class="modal-close"
          onclick="closeModal()"
          type="button"
        >×</button>

        ${html}
      </div>
    </div>
  `;

  modal.classList.add("show");
}

function closeModal() {
  const modal = $("modal");

  if (!modal) return;

  modal.classList.remove("show");
  modal.innerHTML = "";
}

window.closeModal = closeModal;

document.addEventListener("click", event => {
  const modal = $("modal");

  if (modal && event.target === modal) {
    closeModal();
  }
});

/* =========================================================
   LOGIN
========================================================= */

function openLogin() {
  openModal(`
    <h2>Login</h2>

    <form id="loginForm" class="formgrid">

      <input
        id="loginEmail"
        type="email"
        placeholder="Email"
        required
      >

      <input
        id="loginPassword"
        type="password"
        placeholder="Password"
        required
      >

      <button
        type="submit"
        class="btn primary"
      >
        Login
      </button>

    </form>

    <button
      id="googleLogin"
      class="btn"
      style="width:100%;margin-top:10px;"
      type="button"
    >
      Continue with Google
    </button>

    <p style="margin-top:15px;">
      Don't have an account?
      <button
        id="openSignup"
        class="linkbtn"
        type="button"
      >
        Sign Up
      </button>
    </p>
  `);

  $("loginForm").onsubmit = async event => {
    event.preventDefault();

    try {
      await signInWithEmailAndPassword(
        auth,
        $("loginEmail").value.trim(),
        $("loginPassword").value
      );

      closeModal();
      toast("Login successful.");
    } catch (error) {
      console.error(error);
      toast(error.message || "Login failed.");
    }
  };

  $("googleLogin").onclick = async () => {
    try {
      await signInWithPopup(auth, googleProvider);

      closeModal();
      toast("Google login successful.");
    } catch (error) {
      console.error(error);
      toast(error.message || "Google login failed.");
    }
  };

  $("openSignup").onclick = openSignup;
}

/* =========================================================
   SIGN UP
========================================================= */

function openSignup() {
  openModal(`
    <h2>Create Account</h2>

    <form id="signupForm" class="formgrid">

      <input
        id="signupName"
        placeholder="Full name"
        required
      >

      <input
        id="signupEmail"
        type="email"
        placeholder="Email"
        required
      >

      <input
        id="signupPassword"
        type="password"
        minlength="6"
        placeholder="Password"
        required
      >

      <input
        id="signupMobile"
        placeholder="Mobile number"
      >

      <button
        type="submit"
        class="btn primary"
      >
        Create Account
      </button>

    </form>
  `);

  $("signupForm").onsubmit = async event => {
    event.preventDefault();

    try {
      const name = $("signupName").value.trim();
      const email = $("signupEmail").value.trim();
      const password = $("signupPassword").value;
      const mobile = $("signupMobile").value.trim();

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      await setDoc(
        doc(db, "users", credential.user.uid),
        {
          uid: credential.user.uid,
          name,
          email,
          mobile,
          walletBalance: 0,
          role: "user",
          createdAt: serverTimestamp()
        },
        { merge: true }
      );

      closeModal();
      toast("Account created successfully.");
    } catch (error) {
      console.error(error);
      toast(error.message || "Signup failed.");
    }
  };
}

/* =========================================================
   PROFILE
========================================================= */

async function saveProfile() {
  if (!currentUser) {
    toast("Please login first.");
    return;
  }

  try {
    const name =
      $("profileName")?.value.trim() || "";

    const mobile =
      $("profileMobile")?.value.trim() || "";

    await setDoc(
      doc(db, "users", currentUser.uid),
      {
        uid: currentUser.uid,
        name,
        mobile,
        email: currentUser.email || ""
      },
      { merge: true }
    );

    toast("Profile saved.");
  } catch (error) {
    console.error(error);
    toast(error.message || "Unable to save profile.");
  }
}

async function renderProfile() {
  if (!currentUser) {
    openLogin();
    return;
  }

  try {
    const snap = await getDoc(
      doc(db, "users", currentUser.uid)
    );

    const data = snap.exists()
      ? snap.data()
      : {};

    openModal(`
      <h2>My Profile</h2>

      <div class="formgrid">

        <input
          id="profileName"
          value="${esc(data.name || currentUser.displayName || "")}"
          placeholder="Full name"
        >

        <input
          id="profileEmail"
          value="${esc(currentUser.email || "")}"
          disabled
        >

        <input
          id="profileMobile"
          value="${esc(data.mobile || "")}"
          placeholder="Mobile number"
        >

        <div class="wallet-box">
          <strong>Wallet Balance</strong>
          <div style="font-size:24px;">
            ₹${Number(data.walletBalance || 0).toFixed(2)}
          </div>
        </div>

        <button
          class="btn primary"
          id="saveProfileBtn"
          type="button"
        >
          Save Profile
        </button>

        <button
          class="btn"
          onclick="transactions()"
          type="button"
        >
          Wallet Transactions
        </button>

        <button
          class="btn"
          onclick="addMoney()"
          type="button"
        >
          Add Money
        </button>

        <button
          class="btn danger"
          onclick="logoutUser()"
          type="button"
        >
          Logout
        </button>

      </div>
    `);

    $("saveProfileBtn").onclick = saveProfile;

  } catch (error) {
    console.error(error);
    toast(error.message || "Unable to load profile.");
  }
}

/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(auth, async user => {
  currentUser = user || null;

  const authBtn = $("authBtn");

  if (authBtn) {
    authBtn.textContent =
      currentUser ? "Profile" : "Login";
  }

  if (currentUser) {
    try {
      const ref =
        doc(db, "users", currentUser.uid);

      const snap = await getDoc(ref);

      if (!snap.exists()) {
        await setDoc(ref, {
          uid: currentUser.uid,
          name: currentUser.displayName || "",
          email: currentUser.email || "",
          walletBalance: 0,
          role: "user",
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error(
        "User profile error:",
        error
      );
    }

    startMyTournamentListener();

  } else {

    if (myTournamentUnsubscribe) {
      myTournamentUnsubscribe();
      myTournamentUnsubscribe = null;
    }
  }

  if (appStarted) {
    route();
  }
});

/* =========================================================
   AUTH BUTTON
========================================================= */

const authBtn = $("authBtn");

if (authBtn) {
  authBtn.onclick = () => {
    if (currentUser) {
      renderProfile();
    } else {
      openLogin();
    }
  };
}

/* =========================================================
   PUBLIC SETTINGS
========================================================= */

async function loadPublicSettings() {
  try {
    const snap = await getDoc(
      doc(db, "adminSettings", "public")
    );

    if (!snap.exists()) {
      return;
    }

    publicSettings = snap.data() || {};

    if (
      publicSettings.logoUrl &&
      isHttpUrl(publicSettings.logoUrl)
    ) {
      document
        .querySelectorAll(".site-logo")
        .forEach(img => {
          img.src = publicSettings.logoUrl;
        });
    }

    if (
      publicSettings.splashUrl &&
      isHttpUrl(publicSettings.splashUrl)
    ) {
      const splash = $("splashImage");

      if (splash) {
        splash.src =
          publicSettings.splashUrl;
      }
    }

  } catch (error) {
    console.error(
      "Settings load error:",
      error
    );
  }
}

/* =========================================================
   TOURNAMENTS
========================================================= */

function loadTournaments() {
  if (tournamentUnsubscribe) {
    tournamentUnsubscribe();
  }

  tournamentUnsubscribe =
    onSnapshot(
      collection(db, "tournaments"),
      snapshot => {

        tournaments =
          snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
          }));

        tournaments.sort(
          (a, b) =>
            timestampMs(
              a.matchDateTime ||
              a.matchDate ||
              a.date ||
              a.createdAt
            ) -
            timestampMs(
              b.matchDateTime ||
              b.matchDate ||
              b.date ||
              b.createdAt
            )
        );

        tournamentsLoaded = true;
        route();
      },

      error => {
        console.error(
          "Tournament listener error:",
          error
        );

        tournamentsLoaded = true;

        toast(
          "Unable to load tournaments."
        );
      }
    );
}

/* =========================================================
   JOINED IDS
========================================================= */

async function joinedIds() {
  if (!currentUser) {
    return new Set();
  }

  try {
    const q = query(
      collection(
        db,
        "tournamentParticipants"
      ),
      where(
        "uid",
        "==",
        currentUser.uid
      )
    );

    const snap = await getDocs(q);

    return new Set(
      snap.docs.map(
        item => item.data().tournamentId
      )
    );

  } catch (error) {
    console.error(
      "Joined IDs error:",
      error
    );

    return new Set();
  }
}

/* =========================================================
   TOURNAMENT CARD
========================================================= */

function tournamentCard(tournament, joined) {
  const entryFee =
    getEntryFee(tournament);

  const slots =
    getSlots(tournament);

  const joinedCount =
    getJoinedCount(tournament);

  const perKill =
    getPerKill(tournament);

  const firstPrize =
    getFirstPrize(tournament);

  const mode =
    tournament.mode ||
    tournament.gameMode ||
    "Squad";

  const matchDate =
    tournament.matchDateTime ||
    tournament.matchDate ||
    tournament.date;

  return `
    <article class="tournament-card">

      ${
        tournament.imageUrl &&
        isHttpUrl(tournament.imageUrl)
          ? `
            <img
              class="tournament-image"
              src="${esc(tournament.imageUrl)}"
              alt="${esc(tournament.name)}"
            >
          `
          : ""
      }

      <div class="tournament-content">

        <h3>
          ${esc(tournament.name || "Tournament")}
        </h3>

        <div class="prize">
          🏆 ₹${esc(firstPrize)}
        </div>

        <div class="meta">
          🎮 ${esc(mode)}
        </div>

        <div class="meta">
          👥 ${joinedCount}/${slots}
        </div>

        <div class="meta">
          📅 ${esc(formatDate(matchDate))}
        </div>

        <div class="meta">
          🎯 Kill ₹${esc(perKill)}
        </div>

        <div class="entry">
          ${
            entryFee <= 0
              ? "FREE"
              : `Entry ₹${entryFee}`
          }
        </div>

        ${
          joined
            ? `
              <button
                class="btn success"
                disabled
              >
                Joined
              </button>
            `
            : `
              <button
                class="btn primary"
                onclick="showDetails('${esc(tournament.id)}')"
              >
                View Details
              </button>
            `
        }

      </div>
    </article>
  `;
}

/* =========================================================
   HOME
========================================================= */

async function renderHome() {
  const appEl = $("app");

  if (!appEl) return;

  if (!tournamentsLoaded) {
    appEl.innerHTML = `
      <div class="loading">
        Loading tournaments...
      </div>
    `;
    return;
  }

  const joined = await joinedIds();

  const active =
    tournaments.filter(t =>
      !t.status ||
      t.status === "active" ||
      t.status === "upcoming"
    );

  if (!active.length) {
    appEl.innerHTML = `
      <div class="empty">
        No tournaments available.
      </div>
    `;
    return;
  }

  appEl.innerHTML = `
    <div class="section-title">
      <h1>BGMI Tournaments</h1>
      <p>Join and win exciting prizes.</p>
    </div>

    <div class="tournament-grid">
      ${active.map(t =>
        tournamentCard(
          t,
          joined.has(t.id)
        )
      ).join("")}
    </div>
  `;
}

/* =========================================================
   TOURNAMENT DETAILS
========================================================= */

window.showDetails = function(id) {
  const tournament =
    tournaments.find(
      item => item.id === id
    );

  if (!tournament) {
    toast("Tournament not found.");
    return;
  }

  const entryFee =
    getEntryFee(tournament);

  const slots =
    getSlots(tournament);

  const joinedCount =
    getJoinedCount(tournament);

  const perKill =
    getPerKill(tournament);

  const firstPrize =
    getFirstPrize(tournament);

  const totalPrize =
    getTotalPrize(tournament);

  const matchDate =
    tournament.matchDateTime ||
    tournament.matchDate ||
    tournament.date;

  openModal(`
    <h2>${esc(tournament.name)}</h2>

    <div class="details-list">

      <p>
        🏆 First Prize:
        <strong>₹${esc(firstPrize)}</strong>
      </p>

      <p>
        💰 Total Prize:
        <strong>₹${esc(totalPrize)}</strong>
      </p>

      <p>
        🎮 Mode:
        ${esc(
          tournament.mode ||
          tournament.gameMode ||
          "Squad"
        )}
      </p>

      <p>
        👥 Slots:
        ${joinedCount}/${slots}
      </p>

      <p>
        📅 Registration End:
        ${esc(
          formatDate(
            tournament.registrationEnd ||
            tournament.regEnd
          )
        )}
      </p>

      <p>
        🕐 Match:
        ${esc(formatDate(matchDate))}
      </p>

      <p>
        💵 Entry:
        ${
          entryFee <= 0
            ? "FREE"
            : `₹${entryFee}`
        }
      </p>

      <p>
        🎯 Per Kill:
        ₹${esc(perKill)}
      </p>

    </div>

    ${
      tournament.description
        ? `
          <div class="description">
            ${esc(tournament.description)}
          </div>
        `
        : ""
    }

    <div class="warning">
      ⚠️ Never share your OTP, password or
      Firebase account details with anyone.
    </div>

    <button
      class="btn primary"
      style="width:100%;margin-top:15px;"
      onclick="joinTournament('${esc(tournament.id)}')"
      type="button"
    >
      JOIN NOW
    </button>
  `);
};

/* =========================================================
   JOIN TOURNAMENT
========================================================= */

window.joinTournament = async function(tournamentId) {
  const tournament =
    tournaments.find(
      item => item.id === tournamentId
    );

  if (!tournament) {
    toast("Tournament not found.");
    return;
  }

  if (!currentUser) {
    toast("Please login first.");
    openLogin();
    return;
  }

  const entryFee =
    getEntryFee(tournament);

  /*
   * SECURITY:
   * Paid tournament joining must be
   * processed by a trusted backend/
   * Cloud Function because walletBalance
   * must never be writable by players.
   */
  if (entryFee > 0) {
    toast(
      "Paid tournament joining is temporarily unavailable. Please use a free tournament until secure wallet joining is enabled."
    );
    return;
  }

  openJoinForm(tournament);
};

/* =========================================================
   JOIN FORM
========================================================= */

function openJoinForm(tournament) {
  openModal(`
    <h2>
      Join:
      ${esc(tournament.name)}
    </h2>

    <form
      id="joinForm"
      class="formgrid"
    >

      <input
        id="cname"
        placeholder="Character name"
        required
      >

      <input
        id="bgmi"
        placeholder="BGMI ID"
        required
      >

      <input
        id="wa"
        placeholder="WhatsApp number"
        required
      >

      <input
        id="upi"
        placeholder="UPI ID"
        required
      >

      <button
        id="joinSubmitBtn"
        type="submit"
        class="btn primary"
      >
        Confirm Join
      </button>

    </form>
  `);

  $("joinForm").onsubmit =
    async event => {

      event.preventDefault();

      const button =
        $("joinSubmitBtn");

      try {
        if (!auth.currentUser) {
          throw new Error(
            "Please login first."
          );
        }

        const characterName =
          $("cname").value.trim();

        const bgmiId =
          $("bgmi").value.trim();

        const whatsapp =
          $("wa").value.trim();

        const upiId =
          $("upi").value.trim();

        if (!characterName) {
          throw new Error(
            "Character name is required."
          );
        }

        if (!bgmiId) {
          throw new Error(
            "BGMI ID is required."
          );
        }

        if (!whatsapp) {
          throw new Error(
            "WhatsApp number is required."
          );
        }

        if (!upiId) {
          throw new Error(
            "UPI ID is required."
          );
        }

        if (button) {
          button.disabled = true;
          button.textContent = "Joining...";
        }

        const uid =
          auth.currentUser.uid;

        const participantId =
          `${uid}_${tournament.id}`;

        const tournamentRef =
          doc(
            db,
            "tournaments",
            tournament.id
          );

        const participantRef =
          doc(
            db,
            "tournamentParticipants",
            participantId
          );

        await runTransaction(
          db,
          async transaction => {

            const tournamentSnap =
              await transaction.get(
                tournamentRef
              );

            const participantSnap =
              await transaction.get(
                participantRef
              );

            if (!tournamentSnap.exists()) {
              throw new Error(
                "Tournament no longer exists."
              );
            }

            if (participantSnap.exists()) {
              throw new Error(
                "You have already joined this tournament."
              );
            }

            const data =
              tournamentSnap.data() || {};

            if (
              data.status === "closed"
            ) {
              throw new Error(
                "Registration is closed."
              );
            }

            if (
              data.status === "completed"
            ) {
              throw new Error(
                "Tournament already ended."
              );
            }

            const registrationEnd =
              data.registrationEnd ||
              data.regEnd;

            if (
              registrationEnd &&
              timestampMs(registrationEnd) &&
              Date.now() >
                timestampMs(registrationEnd)
            ) {
              throw new Error(
                "Registration has ended."
              );
            }

            const slots =
              Number(
                data.slots ||
                data.maxSlots ||
                data.totalSlots ||
                0
              );

            const joinedCount =
              Number(
                data.joinedCount || 0
              );

            if (
              slots > 0 &&
              joinedCount >= slots
            ) {
              throw new Error(
                "Tournament slots are full."
              );
            }

            const fee =
              Number(data.entryFee || 0);

            if (fee > 0) {
              throw new Error(
                "Paid tournament joining is not enabled."
              );
            }

            transaction.set(
              participantRef,
              {
                uid,
                tournamentId:
                  tournament.id,
                tournamentName:
                  data.name || "",
                characterName,
                bgmiId,
                whatsapp,
                upiId,
                entryFee: 0,
                status: "joined",
                createdAt:
                  serverTimestamp()
              }
            );

            transaction.update(
              tournamentRef,
              {
                joinedCount:
                  joinedCount + 1
              }
            );
          }
        );

        closeModal();

        toast(
          "Tournament joined successfully."
        );

        route();

      } catch (error) {
        console.error(
          "Join error:",
          error
        );

        if (button) {
          button.disabled = false;
          button.textContent =
            "Confirm Join";
        }

        toast(
          error.message ||
          "Unable to join tournament."
        );
      }
    };
}

/* =========================================================
   MY TOURNAMENT LISTENER
========================================================= */

function startMyTournamentListener() {
  if (!currentUser) return;

  if (myTournamentUnsubscribe) {
    myTournamentUnsubscribe();
  }

  const q = query(
    collection(
      db,
      "tournamentParticipants"
    ),
    where(
      "uid",
      "==",
      currentUser.uid
    )
  );

  myTournamentUnsubscribe =
    onSnapshot(
      q,
      () => {},
      error => {
        console.error(
          "My tournament listener:",
          error
        );
      }
    );
}

/* =========================================================
   ADD MONEY - GOOGLE FORM
========================================================= */

window.addMoney = async function () {

  if (!currentUser) {
    toast("Please login first.");
    openLogin();
    return;
  }

  let qrUrl = "";

  try {

    const settingsSnap = await getDoc(
      doc(db, "adminSettings", "public")
    );

    if (settingsSnap.exists()) {
      qrUrl = settingsSnap.data()?.qrUrl || "";
    }

  } catch (error) {
    console.error("QR settings error:", error);
  }

  const googleFormUrl =
    "https://forms.gle/AFZpBCza2ua4UP1N9";

  openModal(`

    <h2>Add Money</h2>

    <p style="
      text-align:center;
      margin-bottom:15px;
      color:#666;
    ">
      पहले QR code पर payment करें।
      Payment के बाद Google Form भरें।
    </p>

    ${
      qrUrl && isHttpUrl(qrUrl)
        ? `
          <div style="
            text-align:center;
            margin-bottom:18px;
          ">

            <img
              src="${esc(qrUrl)}"
              alt="Payment QR"
              style="
                width:220px;
                max-width:100%;
                border-radius:12px;
                display:block;
                margin:auto;
              "
              onerror="
                this.style.display='none';
              "
            >

          </div>
        `
        : `
          <div class="warning">
            Payment QR is not configured by admin yet.
          </div>
        `
    }

    <div style="
      text-align:center;
      margin-top:15px;
    ">

      <a
        href="${googleFormUrl}"
        target="_blank"
        rel="noopener noreferrer"
        class="btn primary"
        style="
          display:block;
          width:100%;
          box-sizing:border-box;
          text-decoration:none;
        "
      >
        📝 Payment Form भरें
      </a>

    </div>

    <p style="
      text-align:center;
      margin-top:15px;
      font-size:13px;
      color:#777;
    ">
      Form में वही email डालें जिससे आपका
      eSports24 account बना है।
    </p>

  `);
};

/* =========================================================
   TRANSACTIONS
========================================================= */

window.transactions =
  async function() {

    if (!currentUser) {
      toast("Please login first.");
      return;
    }

    try {
      const q =
        query(
          collection(
            db,
            "walletTransactions"
          ),
          where(
            "uid",
            "==",
            currentUser.uid
          )
        );

      const snap =
        await getDocs(q);

      const rows =
        snap.docs
          .map(item => ({
            id: item.id,
            ...item.data()
          }))
          .sort(
            (a, b) =>
              timestampMs(
                b.createdAt
              ) -
              timestampMs(
                a.createdAt
              )
          );

      openModal(`
        <h2>Wallet Transactions</h2>

        ${
          rows.length
            ? rows.map(item => `
                <div
                  style="
                    padding:12px;
                    border-bottom:1px solid #ddd;
                  "
                >
                  <strong>
                    ${esc(
                      item.type ||
                      "Transaction"
                    )}
                  </strong>

                  <div>
                    Amount:
                    ₹${esc(
                      item.amount || 0
                    )}
                  </div>

                  <div>
                    Status:
                    ${esc(
                      item.status || ""
                    )}
                  </div>

                  <small>
                    ${esc(
                      formatDate(
                        item.createdAt
                      )
                    )}
                  </small>
                </div>
              `).join("")
            : `
              <p>No transactions found.</p>
            `
        }
      `);

    } catch (error) {
      console.error(error);

      toast(
        error.message ||
        "Unable to load transactions."
      );
    }
  };

/* =========================================================
   LOGOUT
========================================================= */

window.logoutUser =
  async function() {

    try {
      await signOut(auth);

      closeModal();

      toast("Logged out.");

      location.hash = "";

      route();

    } catch (error) {
      console.error(error);

      toast(
        error.message ||
        "Logout failed."
      );
    }
  };

/* =========================================================
   SUPPORT
========================================================= */

function renderSupport() {
  const appEl = $("app");

  appEl.innerHTML = `
    <div class="static-page">

      <h1>Support</h1>

      <form
        id="supportForm"
        class="formgrid"
      >

        <input
          id="supportSubject"
          placeholder="Subject"
          required
        >

        <textarea
          id="supportMessage"
          placeholder="Your message"
          required
        ></textarea>

        <button
          class="btn primary"
          type="submit"
        >
          Send Message
        </button>

      </form>

    </div>
  `;

  $("supportForm").onsubmit =
    async event => {

      event.preventDefault();

      if (!currentUser) {
        toast("Please login first.");
        return;
      }

      try {
        const subject =
          $("supportSubject")
            .value
            .trim();

        const message =
          $("supportMessage")
            .value
            .trim();

        if (!subject || !message) {
          throw new Error(
            "Subject and message are required."
          );
        }

        await addDoc(
          collection(
            db,
            "supportMessages"
          ),
          {
            uid:
              currentUser.uid,
            email:
              currentUser.email || "",
            subject,
            message,
            status: "open",
            createdAt:
              serverTimestamp()
          }
        );

        $("supportForm").reset();

        toast(
          "Support message sent."
        );

      } catch (error) {
        console.error(error);

        toast(
          error.message ||
          "Unable to send message."
        );
      }
    };
}

/* =========================================================
   STATIC PAGES
========================================================= */

function renderStaticPage(page) {
  const appEl = $("app");

  if (!appEl) return;

  if (page === "terms") {
    appEl.innerHTML = `
      <div class="static-page">
        <h1>Terms & Conditions</h1>
        <p>
          Players must provide correct tournament
          information and follow tournament rules.
        </p>
      </div>
    `;
    return;
  }

  if (page === "privacy") {
    appEl.innerHTML = `
      <div class="static-page">
        <h1>Privacy Policy</h1>
        <p>
          User information is used for account,
          tournament and payment related functionality.
        </p>
      </div>
    `;
    return;
  }

  if (page === "support") {
    renderSupport();
    return;
  }
}

/* =========================================================
   ROUTER
========================================================= */

async function route() {
  const hash =
    location.hash
      .replace("#", "")
      .trim();

  if (
    hash === "terms" ||
    hash === "privacy" ||
    hash === "support"
  ) {
    renderStaticPage(hash);
    return;
  }

  await renderHome();
}

window.addEventListener(
  "hashchange",
  route
);

/* =========================================================
   MENU
========================================================= */

const menuBtn = $("menuBtn");
const drawer = $("drawer");
const closeDrawerBtn =
  $("closeDrawer");
const backdrop = $("backdrop");

function closeDrawer() {
  drawer?.classList.remove("open");
  backdrop?.classList.remove("show");
}

function openDrawer() {
  drawer?.classList.add("open");
  backdrop?.classList.add("show");
}

menuBtn?.addEventListener(
  "click",
  openDrawer
);

closeDrawerBtn?.addEventListener(
  "click",
  closeDrawer
);

backdrop?.addEventListener(
  "click",
  closeDrawer
);

/* =========================================================
   START
========================================================= */

async function start() {
  if (appStarted) return;

  appStarted = true;

  await loadPublicSettings();

  loadTournaments();

  await route();
}

start();
