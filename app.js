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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";


/* =========================================================
   FIREBASE
========================================================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();


/* =========================================================
   GLOBAL STATE
========================================================= */

const $ = id => document.getElementById(id);

let currentUser = null;
let tournaments = [];
let publicSettings = {};
let tournamentsLoaded = false;

let tournamentUnsubscribe = null;
let myTournamentUnsubscribe = null;
let appStarted = false;


/* =========================================================
   HELPERS
========================================================= */

function toast(message) {

  const el = $("toast");

  if (!el) {
    console.log(message);
    return;
  }

  el.textContent = String(message || "");

  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2800);
}


function openModal(html) {

  const body = $("modalBody");
  const modal = $("modal");

  if (!body || !modal) {
    return;
  }

  body.innerHTML = html;
  modal.hidden = false;
}


function closeModal() {

  const modal = $("modal");

  if (modal) {
    modal.hidden = true;
  }
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


function fmt(value) {

  if (!value) {
    return "-";
  }

  try {

    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "-";
    }

    return date.toLocaleString(
      "en-IN",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    );

  } catch {

    return "-";

  }
}


function timestampMs(value) {

  if (!value) {
    return 0;
  }

  try {

    if (
      typeof value.toMillis ===
      "function"
    ) {
      return value.toMillis();
    }

    if (
      typeof value.toDate ===
      "function"
    ) {
      return value.toDate().getTime();
    }

    const date =
      new Date(value);

    const ms =
      date.getTime();

    return Number.isNaN(ms)
      ? 0
      : ms;

  } catch {

    return 0;

  }
}


function isTournamentFree(t) {

  return (
    t?.isFree === true ||
    t?.isFree === "true" ||
    t?.isFree === 1 ||
    t?.isFree === "1"
  );

}


/* =========================================================
   FIRST PRIZE
========================================================= */

function getFirstPrize(t) {

  if (!t) {
    return 0;
  }

  const direct =
    Number(
      t.prize1 ??
      t.firstPrize ??
      t.firstPrizeAmount ??
      0
    );

  if (direct > 0) {
    return direct;
  }

  const prizes = t.prizes;

  if (
    prizes &&
    typeof prizes === "object" &&
    !Array.isArray(prizes)
  ) {

    const keys = [
      "1st",
      "1ST",
      "1st Prize",
      "1ST PRIZE",
      "first",
      "First",
      "First Prize",
      "FIRST PRIZE",
      "firstPrize",
      "FirstPrize",
      "1"
    ];

    for (const key of keys) {

      if (
        Object.prototype.hasOwnProperty.call(
          prizes,
          key
        )
      ) {

        const value =
          prizes[key];

        const amount =
          Number(value);

        if (amount > 0) {
          return amount;
        }

        if (
          value &&
          typeof value === "object"
        ) {

          const nested =
            Number(
              value.amount ??
              value.prize ??
              value.value ??
              0
            );

          if (nested > 0) {
            return nested;
          }

        }

      }

    }

    for (
      const [key, value]
      of Object.entries(prizes)
    ) {

      const normalized =
        String(key)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");

      if (
        normalized === "1st" ||
        normalized === "1stprize" ||
        normalized === "first" ||
        normalized === "firstprize" ||
        normalized === "1"
      ) {

        const amount =
          value &&
          typeof value === "object"
            ? Number(
                value.amount ??
                value.prize ??
                value.value ??
                0
              )
            : Number(value);

        if (amount > 0) {
          return amount;
        }

      }

    }

  }

  if (Array.isArray(prizes)) {

    for (const item of prizes) {

      if (
        typeof item === "number" &&
        item > 0
      ) {
        return item;
      }

      if (
        item &&
        typeof item === "object"
      ) {

        const position =
          String(
            item.position ??
            item.rank ??
            item.place ??
            item.name ??
            ""
          )
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "");

        if (
          position === "1st" ||
          position === "1stprize" ||
          position === "first" ||
          position === "firstprize" ||
          position === "1"
        ) {

          const amount =
            Number(
              item.amount ??
              item.prize ??
              item.value ??
              0
            );

          if (amount > 0) {
            return amount;
          }

        }

      }

    }

  }

  return 0;
}


/* =========================================================
   MODAL / DRAWER
========================================================= */

if ($("modalClose")) {

  $("modalClose").onclick =
    closeModal;

}


if ($("menuBtn")) {

  $("menuBtn").onclick = () => {

    $("drawer")?.classList.add(
      "open"
    );

    $("backdrop")?.classList.add(
      "open"
    );

  };

}


if ($("closeDrawer")) {

  $("closeDrawer").onclick = () => {

    $("drawer")?.classList.remove(
      "open"
    );

    $("backdrop")?.classList.remove(
      "open"
    );

  };

}


if ($("backdrop")) {

  $("backdrop").onclick = () => {

    $("drawer")?.classList.remove(
      "open"
    );

    $("backdrop")?.classList.remove(
      "open"
    );

  };

}


/* =========================================================
   AUTH BUTTON
========================================================= */

if ($("authBtn")) {

  $("authBtn").onclick = () => {

    if (currentUser) {
      renderProfile();
    } else {
      renderAuth();
    }

  };

}


/* =========================================================
   LOGIN / SIGNUP
========================================================= */

function renderAuth() {

  openModal(`

    <h2>Login / Signup</h2>

    <form id="loginForm" class="formgrid">

      <input
        id="email"
        type="email"
        placeholder="Email"
        required
      >

      <input
        id="password"
        type="password"
        minlength="6"
        placeholder="Password (6+)"
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
      id="google"
      type="button"
      class="btn"
      style="width:100%;margin-top:8px"
    >
      Continue with Google
    </button>

    <hr>

    <form id="signupForm" class="formgrid">

      <input
        id="sname"
        placeholder="Name"
        required
      >

      <input
        id="smobile"
        placeholder="Mobile number"
        required
      >

      <input
        id="sage"
        type="number"
        min="18"
        placeholder="Age (18+)"
        required
      >

      <input
        id="semail"
        type="email"
        placeholder="Email"
        required
      >

      <input
        id="spass"
        type="password"
        minlength="6"
        placeholder="Password (6+)"
        required
      >

      <button
        type="submit"
        class="btn primary"
      >
        Create account
      </button>

    </form>

  `);


  $("loginForm").onsubmit =
    async event => {

      event.preventDefault();

      try {

        await signInWithEmailAndPassword(
          auth,
          $("email").value.trim(),
          $("password").value
        );

        closeModal();

      } catch (error) {

        console.error(
          "Login error:",
          error
        );

        toast(
          error.message ||
          "Login failed."
        );

      }

    };


  $("signupForm").onsubmit =
    async event => {

      event.preventDefault();

      try {

        const age =
          Number(
            $("sage").value
          );

        if (age < 18) {

          throw new Error(
            "Only 18+ players can join."
          );

        }

        const credential =
          await createUserWithEmailAndPassword(
            auth,
            $("semail").value.trim(),
            $("spass").value
          );

        await saveProfile(
          credential.user,
          {
            name:
              $("sname").value.trim(),

            mobile:
              $("smobile").value.trim(),

            age,

            email:
              $("semail").value.trim()
          }
        );

        closeModal();

      } catch (error) {

        console.error(
          "Signup error:",
          error
        );

        toast(
          error.message ||
          "Signup failed."
        );

      }

    };


  $("google").onclick =
    async () => {

      try {

        const credential =
          await signInWithPopup(
            auth,
            provider
          );

        const profile =
          await getDoc(
            doc(
              db,
              "users",
              credential.user.uid
            )
          );

        if (!profile.exists()) {

          openProfileSetup(
            credential.user
          );

        } else {

          closeModal();

        }

      } catch (error) {

        console.error(
          "Google login error:",
          error
        );

        toast(
          error.message ||
          "Google login failed."
        );

      }

    };

}


/* =========================================================
   SAVE PROFILE
========================================================= */

async function saveProfile(
  user,
  data
) {

  if (!user) {
    return;
  }

  const ref =
    doc(
      db,
      "users",
      user.uid
    );

  const snapshot =
    await getDoc(ref);

  if (!snapshot.exists()) {

    await setDoc(
      ref,
      {
        uid: user.uid,
        ...data,
        walletBalance: 0,
        createdAt:
          serverTimestamp()
      }
    );

  }

}


/* =========================================================
   PROFILE SETUP
========================================================= */

function openProfileSetup(
  user
) {

  openModal(`

    <h2>Complete profile</h2>

    <form
      id="profileSetup"
      class="formgrid"
    >

      <input
        id="pname"
        placeholder="Name"
        required
      >

      <input
        id="pmobile"
        placeholder="Mobile"
        required
      >

      <input
        id="page"
        type="number"
        min="18"
        placeholder="Age (18+)"
        required
      >

      <button
        type="submit"
        class="btn primary"
      >
        Save profile
      </button>

    </form>

  `);


  $("profileSetup").onsubmit =
    async event => {

      event.preventDefault();

      try {

        const age =
          Number(
            $("page").value
          );

        if (age < 18) {

          throw new Error(
            "Only 18+ players can join."
          );

        }

        await saveProfile(
          user,
          {
            name:
              $("pname").value.trim(),

            mobile:
              $("pmobile").value.trim(),

            age,

            email:
              user.email || ""
          }
        );

        closeModal();

      } catch (error) {

        console.error(
          "Profile setup error:",
          error
        );

        toast(
          error.message ||
          "Unable to save profile."
        );

      }

    };

}


/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    currentUser = user;

    if ($("authBtn")) {

      $("authBtn").textContent =
        user
          ? "My Profile"
          : "Login / Signup";

    }


    if (user) {

      try {

        const profile =
          await getDoc(
            doc(
              db,
              "users",
              user.uid
            )
          );

        if (!profile.exists()) {

          openProfileSetup(user);

        }

      } catch (error) {

        console.warn(
          "User profile unavailable:",
          error
        );

      }

    }


    startMyTournamentListener();


    if (
      tournamentsLoaded &&
      location.hash !==
      "#my-tournaments"
    ) {

      renderHome();

    }

  }
);


/* =========================================================
   TOURNAMENT LISTENER
========================================================= */

function loadTournaments() {

  console.log(
    "🔥 Starting tournament listener..."
  );

  const tournamentsRef =
    collection(
      db,
      "tournaments"
    );

  try {

    if (tournamentUnsubscribe) {

      tournamentUnsubscribe();

      tournamentUnsubscribe =
        null;

    }


    tournamentUnsubscribe =
      onSnapshot(

        tournamentsRef,

        snapshot => {

          console.log(
            "🔥 Firestore tournament count:",
            snapshot.size
          );

          tournaments =
            snapshot.docs.map(
              document => {

                const data =
                  document.data();

                return {
                  id: document.id,
                  ...data
                };

              }
            );


          tournaments.sort(
            (a, b) =>
              timestampMs(
                a.registrationEnd
              ) -
              timestampMs(
                b.registrationEnd
              )
          );


          tournamentsLoaded = true;

          console.log(
            "✅ Tournaments loaded:",
            tournaments.length
          );


          if (
            location.hash ===
            "#my-tournaments"
          ) {

            loadMyTournaments();

          } else {

            renderHome();

          }

        },

        error => {

          console.error(
            "❌ FIRESTORE TOURNAMENT ERROR:",
            error
          );

          tournaments = [];

          tournamentsLoaded = true;


          const appEl =
            $("app");

          if (appEl) {

            appEl.innerHTML = `

              <section>

                <h1>
                  BGMI Tournaments
                </h1>

                <div class="card">

                  <h3>
                    Unable to load tournaments
                  </h3>

                  <p class="muted">
                    ${esc(
                      error?.message ||
                      "Unknown Firestore error."
                    )}
                  </p>

                  <p>
                    Please check Firestore
                    rules and Firebase
                    configuration.
                  </p>

                  <button
                    class="btn primary"
                    id="retryTournament"
                  >
                    Retry
                  </button>

                </div>

              </section>

            `;

            $("retryTournament")?.addEventListener(
              "click",
              () => location.reload()
            );

          }

        }

      );

    return tournamentUnsubscribe;

  } catch (error) {

    console.error(
      "Tournament listener exception:",
      error
    );

    throw error;

  }

}


/* =========================================================
   PUBLIC SETTINGS
========================================================= */

async function loadPublicSettings() {

  try {

    const snapshot =
      await getDoc(
        doc(
          db,
          "adminSettings",
          "public"
        )
      );

    publicSettings =
      snapshot.data() || {};


    const logo =
      publicSettings.logoUrl ||
      "";

    if (
      isHttpUrl(logo) &&
      $("logo")
    ) {

      $("logo").src = logo;
      $("logo").hidden = false;

      if ($("brandText")) {
        $("brandText").hidden = true;
      }

    }


    const splash =
      publicSettings.splashUrl ||
      "";

    if (
      isHttpUrl(splash) &&
      $("splash")
    ) {

      $("splash").style.backgroundImage =
        `url("${splash.replace(
          /"/g,
          "%22"
        )}")`;

      $("splash").style.backgroundSize =
        "cover";

      $("splash").style.backgroundPosition =
        "center";

    }

  } catch (error) {

    console.warn(
      "⚠ Public settings unavailable:",
      error
    );

  }

}


/* =========================================================
   JOINED IDS
========================================================= */

async function joinedIds() {

  if (!currentUser) {
    return new Set();
  }

  try {

    const q =
      query(
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

    const snapshot =
      await getDocs(q);

    return new Set(
      snapshot.docs.map(
        d =>
          d.data().tournamentId
      )
    );

  } catch (error) {

    console.warn(
      "Joined tournament check unavailable:",
      error
    );

    return new Set();

  }

}


/* =========================================================
   HOME
========================================================= */

function renderHome() {

  const appEl =
    $("app");

  if (!appEl) {

    console.error(
      "❌ #app element not found."
    );

    return;

  }


  console.log(
    "📦 Rendering tournaments:",
    tournaments.length
  );


  appEl.innerHTML = `

    <section>

      <h1>
        BGMI Tournaments
      </h1>

      <p class="muted">
        Available Tournaments
      </p>

      <div
        id="tourGrid"
        class="grid"
      >

        ${
          tournaments.length

            ? tournaments
                .map(t => card(t))
                .join("")

            : `

              <div class="card">

                <h3>
                  No tournaments found
                </h3>

                <p class="muted">
                  Firestore में
                  <b>tournaments</b>
                  collection check करें.
                </p>

              </div>

            `
        }

      </div>

    </section>

  `;


  document
    .querySelectorAll(
      "[data-tour]"
    )
    .forEach(button => {

      button.onclick = () => {

        details(
          button.dataset.tour
        );

      };

    });

}


/* =========================================================
   TOURNAMENT CARD
========================================================= */

function card(idOrTournament) {

  const t =
    typeof idOrTournament ===
    "string"

      ? tournaments.find(
          item =>
            item.id ===
            idOrTournament
        )

      : idOrTournament;


  if (!t) {
    return "";
  }


  const totalSlots =
    Number(
      t.totalSlots || 0
    );

  const joinedCount =
    Number(
      t.joinedCount || 0
    );

  const left =
    Math.max(
      0,
      totalSlots - joinedCount
    );


  const image =
    isHttpUrl(t.imageUrl)
      ? t.imageUrl
      : "";


  const entryFee =
    Number(
      t.entryFee || 0
    );

  const perKill =
    Number(
      t.perKill || 0
    );

  const free =
    isTournamentFree(t);

  const firstPrize =
    getFirstPrize(t);


  return `

    <article
      class="card tcard"
    >

      ${
        image

          ? `

            <img
              src="${esc(image)}"
              alt="${esc(
                t.name ||
                "BGMI Tournament"
              )}"
              loading="lazy"
            >

          `

          : `

            <div
              style="
                height:180px;
                display:flex;
                align-items:center;
                justify-content:center;
                background:#151515;
                border-radius:10px;
                font-size:28px;
              "
            >
              🎮 BGMI
            </div>

          `
      }


      <div
        class="first-prize-box"
        style="
          margin:10px 0 8px;
          padding:10px;
          text-align:center;
          border-radius:10px;
          background:rgba(255,193,7,.12);
          border:1px solid rgba(255,193,7,.35);
        "
      >

        <div
          style="
            font-size:13px;
            font-weight:700;
            opacity:.85;
            text-transform:uppercase;
          "
        >
          🥇 FIRST PRIZE
        </div>

        <div
          style="
            font-size:24px;
            font-weight:800;
            margin-top:3px;
          "
        >
          ₹${firstPrize.toLocaleString(
            "en-IN"
          )}
        </div>

      </div>


      <div class="tcontent">

        <h3>
          ${esc(
            t.name ||
            "BGMI Tournament"
          )}
        </h3>


        <div class="meta">

          <span>
            🏆 ${esc(
              t.mode ||
              "BGMI"
            )}
          </span>

          <span>
            🎟 ${left}/${totalSlots}
          </span>

          <span>
            📅 ${fmt(
              t.matchDateTime
            )}
          </span>

          <span>
            🎯 Kill ₹${perKill}
          </span>

        </div>


        <div class="fee">

          ${
            free
              ? "FREE"
              : "₹" +
                entryFee.toLocaleString(
                  "en-IN"
                )
          }

        </div>


        <button
          type="button"
          class="btn primary"
          data-tour="${esc(t.id)}"
        >
          View / Join
        </button>

      </div>

    </article>

  `;

}


/* =========================================================
   TOURNAMENT DETAILS
========================================================= */

function details(id) {

  const t =
    tournaments.find(
      item =>
        item.id === id
    );


  if (!t) {

    toast(
      "Tournament not found."
    );

    return;

  }


  const image =
    isHttpUrl(t.imageUrl)
      ? t.imageUrl
      : "";


  const entryFee =
    Number(
      t.entryFee || 0
    );

  const perKill =
    Number(
      t.perKill || 0
    );

  const totalSlots =
    Number(
      t.totalSlots || 0
    );

  const joinedCount =
    Number(
      t.joinedCount || 0
    );

  const free =
    isTournamentFree(t);


  openModal(`

    <h2>
      ${esc(
        t.name ||
        "BGMI Tournament"
      )}
    </h2>


    ${
      image

        ? `

          <img
            src="${esc(image)}"
            alt=""
            style="
              width:100%;
              border-radius:10px;
              margin-bottom:12px;
            "
          >

        `

        : ""
    }


    <p>
      <b>Prize Distribution</b>
    </p>


    <div class="prizes">

      ${prizeRows(
        t.prizes,
        t
      )}

    </div>


    <p>

      <b>Total Prize:</b>

      ₹${Number(
        t.prizeTotal || 0
      ).toLocaleString(
        "en-IN"
      )}

    </p>


    <p>

      <b>Slots:</b>
      ${joinedCount}/${totalSlots}

      &nbsp;

      <b>Mode:</b>
      ${esc(
        t.mode || "-"
      )}

    </p>


    <p>

      <b>Registration End:</b>
      ${fmt(
        t.registrationEnd
      )}

    </p>


    <p>

      <b>Match Date:</b>
      ${fmt(
        t.matchDateTime
      )}

    </p>


    <p>

      <b>Entry:</b>

      ${
        free
          ? "FREE"
          : "₹" +
            entryFee.toLocaleString(
              "en-IN"
            )
      }

      &nbsp;

      <b>Per Kill:</b>
      ₹${perKill}

    </p>


    <div class="warn">
      ⚠ Hacker Not Allowed
    </div>


    <button
      id="joinNow"
      type="button"
      class="btn primary"
      style="width:100%"
    >
      JOIN NOW
    </button>

  `);


  $("joinNow")?.addEventListener(
    "click",
    () => {

      if (currentUser) {
        joinForm(t);
      } else {
        renderAuth();
      }

    }
  );

}


/* =========================================================
   PRIZE ROWS
========================================================= */

function prizeRows(
  prizes,
  tournament = null
) {

  const firstPrize =
    tournament
      ? getFirstPrize(tournament)
      : 0;


  if (
    firstPrize > 0
  ) {

    let html = `

      <div class="listrow">

        <b>
          🥇 1st Prize
        </b>

        <span
          style="float:right"
        >
          ₹${firstPrize.toLocaleString(
            "en-IN"
          )}
        </span>

      </div>

    `;


    if (
      prizes &&
      typeof prizes ===
      "object" &&
      !Array.isArray(prizes)
    ) {

      const firstKeys = new Set([
        "1st",
        "1ST",
        "1st Prize",
        "1ST PRIZE",
        "first",
        "First",
        "First Prize",
        "FIRST PRIZE",
        "firstPrize",
        "FirstPrize",
        "1"
      ]);


      for (
        const [position, value]
        of Object.entries(prizes)
      ) {

        if (
          firstKeys.has(position)
        ) {
          continue;
        }


        const amount =
          value &&
          typeof value === "object"
            ? Number(
                value.amount ??
                value.prize ??
                value.value ??
                0
              )
            : Number(
                value || 0
              );


        html += `

          <div class="listrow">

            <b>
              ${esc(position)}
            </b>

            <span
              style="float:right"
            >
              ₹${amount.toLocaleString(
                "en-IN"
              )}
            </span>

          </div>

        `;

      }

    }


    return html;

  }


  if (
    !prizes ||
    typeof prizes !==
    "object"
  ) {

    return `

      <p class="muted">
        No prize distribution configured.
      </p>

    `;

  }


  if (Array.isArray(prizes)) {

    if (!prizes.length) {

      return `

        <p class="muted">
          No prize distribution configured.
        </p>

      `;

    }


    return prizes
      .map(item => {

        if (
          typeof item ===
          "number"
        ) {

          return `

            <div class="listrow">

              <b>
                Prize
              </b>

              <span
                style="float:right"
              >
                ₹${item.toLocaleString(
                  "en-IN"
                )}
              </span>

            </div>

          `;

        }


        if (
          item &&
          typeof item ===
          "object"
        ) {

          const position =
            item.position ??
            item.rank ??
            item.place ??
            item.name ??
            "Prize";

          const amount =
            Number(
              item.amount ??
              item.prize ??
              item.value ??
              0
            );


          return `

            <div class="listrow">

              <b>
                ${esc(position)}
              </b>

              <span
                style="float:right"
              >
                ₹${amount.toLocaleString(
                  "en-IN"
                )}
              </span>

            </div>

          `;

        }


        return "";

      })
      .join("");

  }


  const entries =
    Object.entries(prizes);


  if (!entries.length) {

    return `

      <p class="muted">
        No prize distribution configured.
      </p>

    `;

  }


  return entries
    .map(
      ([position, value]) => {

        const amount =
          value &&
          typeof value === "object"
            ? Number(
                value.amount ??
                value.prize ??
                value.value ??
                0
              )
            : Number(
                value || 0
              );


        return `

          <div class="listrow">

            <b>
              ${esc(position)}
            </b>

            <span
              style="float:right"
            >
              ₹${amount.toLocaleString(
                "en-IN"
              )}
            </span>

          </div>

        `;

      }
    )
    .join("");

}


/* =========================================================
   JOIN FORM
========================================================= */

function joinForm(t) {

  openModal(`

    <h2>
      Join:
      ${esc(t.name)}
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

      try {

        if (!auth.currentUser) {

          throw new Error(
            "Please login first."
          );

        }


        const token =
          await auth.currentUser
            .getIdToken();


        const response =
          await fetch(
            "/api/joinTournament",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "Authorization":
                  "Bearer " +
                  token
              },

              body:
                JSON.stringify({
                  tournamentId:
                    t.id,

                  characterName:
                    $("cname")
                      .value
                      .trim(),

                  bgmiId:
                    $("bgmi")
                      .value
                      .trim(),

                  whatsapp:
                    $("wa")
                      .value
                      .trim(),

                  upiId:
                    $("upi")
                      .value
                      .trim()
                })
            }
          );


        let result;

        try {
          result =
            await response.json();
        } catch {
          result = {
            success: false,
            message:
              "Server returned invalid response."
          };
        }


        if (
          !response.ok ||
          !result.success
        ) {

          throw new Error(
            result.message ||
            "Unable to join tournament."
          );

        }


        toast(
          result.message ||
          "Tournament joined successfully."
        );

        closeModal();

        renderHome();

      } catch (error) {

        console.error(
          "Join error:",
          error
        );

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

  if (
    myTournamentUnsubscribe
  ) {

    myTournamentUnsubscribe();

    myTournamentUnsubscribe =
      null;

  }


  if (!currentUser) {
    return;
  }


  try {

    const q =
      query(
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

        snapshot => {

          const mine =
            snapshot.docs.map(
              document =>
                ({
                  id:
                    document.id,

                  ...document.data()
                })
            );


          if (
            location.hash ===
            "#my-tournaments"
          ) {

            renderMyTournaments(
              mine
            );

          }

        },

        error => {

          console.warn(
            "My tournament listener unavailable:",
            error
          );

        }

      );

  } catch (error) {

    console.warn(
      "My tournament listener error:",
      error
    );

  }

}


/* =========================================================
   LOAD MY TOURNAMENTS
========================================================= */

async function loadMyTournaments() {

  if (!currentUser) {

    renderAuth();

    return;

  }


  try {

    const q =
      query(
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


    const snapshot =
      await getDocs(q);


    renderMyTournaments(
      snapshot.docs.map(
        document => ({
          id:
            document.id,

          ...document.data()
        })
      )
    );

  } catch (error) {

    console.error(
      "My tournaments error:",
      error
    );

    toast(
      "Unable to load joined tournaments: " +
      (
        error.message ||
        ""
      )
    );

  }

}


/* =========================================================
   RENDER MY TOURNAMENTS
========================================================= */

function renderMyTournaments(
  mine
) {

  const appEl =
    $("app");

  if (!appEl) {
    return;
  }


  appEl.innerHTML = `

    <section>

      <h1>
        My Tournaments
      </h1>


      ${
        mine.length

          ? mine.map(item => `

              <div
                class="card"
                data-mine-id="${esc(
                  item.tournamentId ||
                  ""
                )}"
              >

                <h3>
                  ${esc(
                    item.tournamentName ||
                    "Tournament"
                  )}
                </h3>


                <p>

                  <b>Character:</b>
                  ${esc(
                    item.characterName ||
                    ""
                  )}

                </p>


                <p>

                  <b>BGMI ID:</b>
                  ${esc(
                    item.bgmiId ||
                    ""
                  )}

                </p>


                <p>

                  <b>Joined:</b>
                  ${fmt(
                    item.joinedAt
                  )}

                </p>


                <div class="room muted">

                  Room details are shown here
                  when published for participants.

                </div>

              </div>

            `).join("")

          : `

              <div class="card">

                <h3>
                  No joined tournaments.
                </h3>

                <p class="muted">
                  Join a tournament to see
                  it here.
                </p>

              </div>

            `
      }

    </section>

  `;


  mine.forEach(
    async item => {

      if (!item.tournamentId) {
        return;
      }


      try {

        const roomSnapshot =
          await getDoc(
            doc(
              db,
              "roomCredentials",
              item.tournamentId
            )
          );


        if (
          !roomSnapshot.exists()
        ) {
          return;
        }


        const selectorId =
          CSS.escape(
            item.tournamentId
          );


        const element =
          document.querySelector(
            `[data-mine-id="${selectorId}"] .room`
          );


        if (!element) {
          return;
        }


        const room =
          roomSnapshot.data();


        element.innerHTML = `

          <b>Room ID:</b>
          ${esc(
            room.roomId ||
            ""
          )}

          <br>

          <b>Password:</b>
          ${esc(
            room.roomPassword ||
            ""
          )}

        `;

      } catch (error) {

        console.warn(
          "Room details unavailable:",
          error
        );

      }

    }
  );

}


/* =========================================================
   PROFILE
========================================================= */

async function renderProfile() {

  if (!currentUser) {

    renderAuth();

    return;

  }


  try {

    const snapshot =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );


    const profile =
      snapshot.data() || {};


    openModal(`

      <h2>
        My Profile
      </h2>


      <p>

        <b>Name:</b>
        ${esc(
          profile.name ||
          ""
        )}

      </p>


      <p>

        <b>Mobile:</b>
        ${esc(
          profile.mobile ||
          ""
        )}

      </p>


      <p>

        <b>Age:</b>
        ${esc(
          profile.age ||
          ""
        )}

      </p>


      <p>

        <b>Email:</b>
        ${esc(
          profile.email ||
          currentUser.email ||
          ""
        )}

      </p>


      <div class="fee">

        Wallet ₹${Number(
          profile.walletBalance ||
          0
        ).toFixed(2)}

      </div>


      <div class="row">

        <button
          id="addMoney"
          type="button"
          class="btn primary"
        >
          Add Money
        </button>


        <button
          id="history"
          type="button"
          class="btn"
        >
          Transactions
        </button>


        <button
          id="joined"
          type="button"
          class="btn"
        >
          Joined Tournaments
        </button>


        <button
          id="logout"
          type="button"
          class="btn danger"
        >
          Logout
        </button>

      </div>

    `);


    $("logout")?.addEventListener(
      "click",
      async () => {

        try {

          await signOut(auth);

          closeModal();

        } catch (error) {

          toast(
            error.message ||
            "Logout failed."
          );

        }

      }
    );


    $("addMoney")?.addEventListener(
      "click",
      addMoney
    );


    $("history")?.addEventListener(
      "click",
      transactions
    );


    $("joined")?.addEventListener(
      "click",
      loadMyTournaments
    );

  } catch (error) {

    console.error(
      "Profile error:",
      error
    );

    toast(
      "Unable to load profile."
    );

  }

}


/* =========================================================
   ADD MONEY
========================================================= */

async function addMoney() {

  try {

    const settings =
      await getDoc(
        doc(
          db,
          "adminSettings",
          "public"
        )
      );


    const qrUrl =
      settings.data()?.qrUrl ||
      "";


    openModal(`

      <h2>
        Add Money
      </h2>


      ${
        qrUrl &&
        isHttpUrl(qrUrl)

          ? `

            <img
              src="${esc(qrUrl)}"
              alt="Payment QR"
              style="
                max-width:260px;
                width:100%;
                display:block;
                margin:auto;
              "
            >

          `

          : `

            <p class="muted">
              Payment QR is not configured yet.
            </p>

          `
      }


      <form
        id="deposit"
        class="formgrid"
      >

        <input
          id="damt"
          type="number"
          min="1"
          max="50000"
          placeholder="Amount"
          required
        >


        <input
          id="dutr"
          placeholder="UTR"
          required
        >


        <input
          id="dmob"
          placeholder="Mobile number"
          required
        >


        <input
          id="demail"
          type="email"
          value="${esc(
            currentUser?.email ||
            ""
          )}"
          placeholder="Email ID"
          required
        >


        <button
          type="submit"
          class="btn primary"
        >
          Submit
        </button>

      </form>

    `);


    $("deposit").onsubmit =
      async event => {

        event.preventDefault();

        try {

          if (!currentUser) {

            throw new Error(
              "Please login first."
            );

          }


          const token =
            await currentUser
              .getIdToken();


          const response =
            await fetch(
              "/api/submitDeposit",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  "Authorization":
                    "Bearer " +
                    token
                },

                body:
                  JSON.stringify({

                    amount:
                      Number(
                        $("damt")
                          .value
                      ),

                    utr:
                      $("dutr")
                        .value
                        .trim(),

                    mobile:
                      $("dmob")
                        .value
                        .trim(),

                    email:
                      $("demail")
                        .value
                        .trim()

                  })

              }
            );


          let result;

          try {
            result =
              await response.json();
          } catch {
            result = {
              success: false,
              message:
                "Server returned invalid response."
            };
          }


          if (
            !response.ok ||
            !result.success
          ) {

            throw new Error(
              result.message ||
              "Unable to submit deposit."
            );

          }


          toast(
            result.message ||
            "Deposit submitted."
          );

          closeModal();

        } catch (error) {

          console.error(
            "Deposit error:",
            error
          );

          toast(
            error.message ||
            "Unable to submit deposit."
          );

        }

      };

  } catch (error) {

    console.error(
      "❌ PAYMENT SETTINGS ERROR:",
      error
    );

    toast(
      "Payment settings error: " +
      (
        error.message ||
        "Unknown error"
      )
    );

  }

}


/* =========================================================
   TRANSACTIONS
========================================================= */

async function transactions() {

  if (!currentUser) {

    renderAuth();

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


    const snapshot =
      await getDocs(q);


    const rows =
      snapshot.docs
        .map(
          document =>
            document.data()
        )
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

      <h2>
        Transaction History
      </h2>


      ${
        rows.length

          ? rows.map(item => `

              <div class="listrow">

                <b>
                  ${esc(
                    item.type ||
                    ""
                  )}
                </b>

                —

                ₹${Number(
                  item.amount ||
                  0
                ).toFixed(2)}

                <br>

                <span class="muted">

                  ${esc(
                    item.description ||
                    ""
                  )}

                  ·

                  ${fmt(
                    item.createdAt
                  )}

                </span>

              </div>

            `).join("")

          : `

              <p class="muted">
                No transactions.
              </p>

            `
      }

    `);

  } catch (error) {

    console.error(
      "Transactions error:",
      error
    );

    toast(
      "Unable to load transactions: " +
      (
        error.message ||
        ""
      )
    );

  }

}


/* =========================================================
   STATIC PAGES
========================================================= */

function renderStatic(
  title,
  body
) {

  const appEl =
    $("app");

  if (!appEl) {
    return;
  }


  appEl.innerHTML = `

    <article class="card">

      <h1>
        ${title}
      </h1>

      ${body}

    </article>

  `;

}


/* =========================================================
   ROUTING
========================================================= */

function route() {

  const hash =
    location.hash ||
    "#home";


  if (
    hash ===
    "#my-tournaments"
  ) {

    loadMyTournaments();

    return;

  }


  if (
    hash ===
    "#about"
  ) {

    renderStatic(
      "About Us",

      `

        <p>

          eSports24 is a tournament-registration
          platform for competitive BGMI events.

        </p>

        <p>

          Tournament information, entry rules,
          prizes and payment status should always
          be verified before joining.

        </p>

      `
    );

    return;

  }


  if (
    hash ===
    "#terms"
  ) {

    renderStatic(
      "Terms & Conditions",

      `

        <p>

          Users must be 18 or older to participate.
          Do not share OTPs, UPI PINs, card PINs
          or passwords.

        </p>


        <p>

          Tournament rules, eligibility, refunds,
          prize settlement and disqualification
          conditions must be displayed before joining.

        </p>


        <p>

          Paid gaming/tournament operations may be
          subject to applicable Indian and state laws,
          tax rules, consumer protection requirements
          and platform/game publisher rules.

        </p>

      `
    );

    return;

  }


  if (
    hash ===
    "#privacy"
  ) {

    renderStatic(
      "Privacy Policy",

      `

        <p>

          eSports24 may collect name, mobile number,
          email, age, BGMI ID, WhatsApp number,
          UPI ID and transaction/tournament records
          needed to operate the service.

        </p>


        <p>

          Use appropriate access controls and
          retention limits for stored information.

        </p>


        <p>

          Never collect UPI PIN, OTP, card PIN
          or banking passwords.

        </p>

      `
    );

    return;

  }


  if (
    hash ===
    "#support"
  ) {

    renderStatic(
      "Contact Us",

      `

        <p>

          For support, contact

          <a href="mailto:alesihelpdesk@gmail.com">
            alesihelpdesk@gmail.com
          </a>.

        </p>


        <form
          id="supportForm"
          class="formgrid"
        >

          <input
            id="sn"
            placeholder="Name"
            required
          >


          <input
            id="se"
            type="email"
            placeholder="Email"
            required
          >


          <input
            id="ss"
            placeholder="Subject"
            required
          >


          <textarea
            id="sm"
            placeholder="Problem"
            required
          ></textarea>


          <button
            type="submit"
            class="btn primary"
          >
            Submit
          </button>

        </form>

      `
    );


    $("supportForm").onsubmit =
      async event => {

        event.preventDefault();

        try {

          await addDoc(
            collection(
              db,
              "supportMessages"
            ),
            {

              name:
                $("sn")
                  .value
                  .trim(),

              email:
                $("se")
                  .value
                  .trim(),

              subject:
                $("ss")
                  .value
                  .trim(),

              message:
                $("sm")
                  .value
                  .trim(),

              createdAt:
                serverTimestamp()

            }
          );


          toast(
            "Support request submitted."
          );


          event.target.reset();

        } catch (error) {

          console.error(
            "Support error:",
            error
          );

          toast(
            error.message ||
            "Unable to submit support request."
          );

        }

      };

    return;

  }


  renderHome();

}


/* =========================================================
   SPLASH
========================================================= */

function hideSplash() {

  const splash =
    $("splash");

  if (!splash) {
    return;
  }


  splash.hidden = true;

  splash.setAttribute(
    "aria-hidden",
    "true"
  );


  splash.style.setProperty(
    "display",
    "none",
    "important"
  );

}


/* =========================================================
   BOOT ERROR
========================================================= */

function showBootError(
  error
) {

  console.error(
    "❌ APP BOOT ERROR:",
    error
  );


  hideSplash();


  const appEl =
    $("app");

  if (!appEl) {
    return;
  }


  appEl.innerHTML = `

    <section>

      <h1>
        eSports24
      </h1>


      <div class="card">

        <h3>
          Website loading error
        </h3>


        <p class="muted">
          Website start nahi ho pa raha hai.
        </p>


        <p class="muted">
          ${esc(
            error?.message ||
            "Unknown application error."
          )}
        </p>


        <button
          id="retryApp"
          type="button"
          class="btn primary"
        >
          Retry
        </button>

      </div>

    </section>

  `;


  $("retryApp")?.addEventListener(
    "click",
    () => location.reload()
  );

}


/* =========================================================
   GLOBAL ERROR HANDLING
========================================================= */

window.addEventListener(
  "error",
  event => {

    console.error(
      "❌ GLOBAL JAVASCRIPT ERROR:",
      event.error ||
      event.message
    );

  }
);


window.addEventListener(
  "unhandledrejection",
  event => {

    console.error(
      "❌ UNHANDLED PROMISE:",
      event.reason
    );

  }
);


/* =========================================================
   START APP
========================================================= */

function startApp() {

  if (appStarted) {
    return;
  }


  appStarted = true;


  console.log(
    "🚀 eSports24 starting..."
  );


  /*
   * IMPORTANT:
   * Hide splash immediately.
   *
   * Firebase or Firestore must
   * never block the initial UI.
   */

  hideSplash();


  /*
   * HASH ROUTING
   */

  window.addEventListener(
    "hashchange",
    () => {

      try {

        route();

      } catch (error) {

        showBootError(error);

      }

    }
  );


  /*
   * RENDER INITIAL PAGE FIRST
   */

  try {

    route();

  } catch (error) {

    showBootError(error);

  }


  /*
   * PUBLIC SETTINGS
   *
   * Background operation.
   * Never await.
   */

  Promise.resolve()
    .then(
      () =>
        loadPublicSettings()
    )
    .catch(
      error => {

        console.warn(
          "⚠ Public settings skipped:",
          error
        );

      }
    );


  /*
   * TOURNAMENTS
   *
   * Realtime listener.
   * Never await.
   */

  try {

    loadTournaments();

  } catch (error) {

    console.error(
      "❌ Tournament listener failed:",
      error
    );


    tournaments = [];

    tournamentsLoaded =
      true;


    showBootError(error);

  }


  console.log(
    "✅ eSports24 started."
  );

}


/* =========================================================
   DOM READY
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    startApp,
    {
      once: true
    }
  );

} else {

  startApp();

}
