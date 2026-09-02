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


/* =========================
   FIREBASE
========================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();


/* =========================
   HELPERS
========================= */

const $ = id => document.getElementById(id);

let currentUser = null;
let tournaments = [];
let publicSettings = {};
let tournamentsLoaded = false;


function toast(msg) {
  const el = $("toast");

  if (!el) {
    console.log(msg);
    return;
  }

  el.textContent = msg;
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2800);
}


function openModal(html) {
  const body = $("modalBody");
  const modal = $("modal");

  if (!body || !modal) return;

  body.innerHTML = html;
  modal.hidden = false;
}


function closeModal() {
  const modal = $("modal");

  if (modal) {
    modal.hidden = true;
  }
}


function isHttpUrl(v) {
  try {
    const u = new URL(String(v || "").trim());
    return u.protocol === "https:";
  } catch {
    return false;
  }
}


function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m])
  );
}


function fmt(v) {
  if (!v) return "-";

  try {
    const d =
      typeof v?.toDate === "function"
        ? v.toDate()
        : new Date(v);

    if (Number.isNaN(d.getTime())) {
      return "-";
    }

    return d.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });

  } catch {
    return "-";
  }
}


function timestampMs(v) {
  if (!v) return 0;

  try {
    if (typeof v.toMillis === "function") {
      return v.toMillis();
    }

    if (typeof v.toDate === "function") {
      return v.toDate().getTime();
    }

    const d = new Date(v);

    return Number.isNaN(d.getTime())
      ? 0
      : d.getTime();

  } catch {
    return 0;
  }
}


function isTournamentFree(t) {
  return (
    t.isFree === true ||
    t.isFree === "true" ||
    t.isFree === 1 ||
    t.isFree === "1"
  );
}


/* =========================
   FIRST PRIZE HELPER
========================= */

function getFirstPrize(t) {

  if (!t) {
    return 0;
  }


  /*
    1️⃣ Direct Firestore fields

    Supports:
    prize1
    firstPrize
    firstPrizeAmount
  */

  const directPrize =
    Number(
      t.prize1 ??
      t.firstPrize ??
      t.firstPrizeAmount ??
      0
    );

  if (directPrize > 0) {
    return directPrize;
  }


  /*
    2️⃣ prizes object/map
  */

  const prizes = t.prizes;


  if (
    prizes &&
    typeof prizes === "object" &&
    !Array.isArray(prizes)
  ) {

    const firstKeys = [
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


    /*
      Exact/common keys
    */

    for (const key of firstKeys) {

      if (
        Object.prototype.hasOwnProperty.call(
          prizes,
          key
        )
      ) {

        const value =
          prizes[key];


        /*
          Direct number
        */

        const amount =
          Number(value);


        if (amount > 0) {
          return amount;
        }


        /*
          Nested object
        */

        if (
          value &&
          typeof value === "object"
        ) {

          const nestedAmount =
            Number(
              value.amount ??
              value.prize ??
              value.value ??
              0
            );


          if (nestedAmount > 0) {
            return nestedAmount;
          }

        }

      }

    }


    /*
      Case-insensitive fallback
    */

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


  /*
    3️⃣ prizes array
  */

  if (Array.isArray(prizes)) {

    for (const item of prizes) {

      if (!item) continue;


      /*
        Array item is direct number
      */

      if (typeof item === "number") {

        if (item > 0) {
          return item;
        }

      }


      /*
        Array item is object
      */

      if (typeof item === "object") {

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


  /*
    Nothing found
  */

  return 0;
}


/* =========================
   MODAL / MENU
========================= */

if ($("modalClose")) {
  $("modalClose").onclick = closeModal;
}


if ($("menuBtn")) {
  $("menuBtn").onclick = () => {

    $("drawer")?.classList.add("open");
    $("backdrop")?.classList.add("open");

  };
}


if ($("closeDrawer")) {
  $("closeDrawer").onclick = () => {

    $("drawer")?.classList.remove("open");
    $("backdrop")?.classList.remove("open");

  };
}


if ($("backdrop")) {
  $("backdrop").onclick = () => {

    $("drawer")?.classList.remove("open");
    $("backdrop")?.classList.remove("open");

  };
}


/* =========================
   AUTH BUTTON
========================= */

if ($("authBtn")) {

  $("authBtn").onclick = () => {

    if (currentUser) {
      renderProfile();
    } else {
      renderAuth();
    }

  };

}


/* =========================
   LOGIN / SIGNUP
========================= */

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

      <button class="btn primary">
        Login
      </button>

    </form>

    <button
      id="google"
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

      <button class="btn primary">
        Create account
      </button>

    </form>

  `);


  $("loginForm").onsubmit = async e => {

    e.preventDefault();

    try {

      await signInWithEmailAndPassword(
        auth,
        $("email").value.trim(),
        $("password").value
      );

      closeModal();

    } catch (x) {

      console.error(x);
      toast(x.message);

    }

  };


  $("signupForm").onsubmit = async e => {

    e.preventDefault();

    try {

      const age =
        Number($("sage").value);

      if (age < 18) {
        throw new Error(
          "Only 18+ players can join."
        );
      }


      const cred =
        await createUserWithEmailAndPassword(
          auth,
          $("semail").value.trim(),
          $("spass").value
        );


      await saveProfile(
        cred.user,
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

    } catch (x) {

      console.error(x);
      toast(x.message);

    }

  };


  $("google").onclick = async () => {

    try {

      const c =
        await signInWithPopup(
          auth,
          provider
        );


      const p =
        await getDoc(
          doc(
            db,
            "users",
            c.user.uid
          )
        );


      if (!p.exists()) {

        openProfileSetup(
          c.user,
          true
        );

      } else {

        closeModal();

      }

    } catch (x) {

      console.error(x);
      toast(x.message);

    }

  };

}


/* =========================
   SAVE PROFILE
========================= */

async function saveProfile(user, data) {

  const ref =
    doc(
      db,
      "users",
      user.uid
    );


  const snap =
    await getDoc(ref);


  if (!snap.exists()) {

    await setDoc(
      ref,
      {
        uid: user.uid,
        ...data,
        walletBalance: 0,
        createdAt: serverTimestamp()
      }
    );

  }

}


/* =========================
   PROFILE SETUP
========================= */

function openProfileSetup(
  user,
  closeAfter = false
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

      <button class="btn primary">
        Save profile
      </button>

    </form>

  `);


  $("profileSetup").onsubmit =
    async e => {

      e.preventDefault();

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

      } catch (x) {

        console.error(x);
        toast(x.message);

      }

    };

}


/* =========================
   AUTH STATE
========================= */

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

        const p =
          await getDoc(
            doc(
              db,
              "users",
              user.uid
            )
          );


        if (!p.exists()) {
          openProfileSetup(user);
        }

      } catch (e) {

        console.warn(
          "User profile unavailable:",
          e
        );

      }

    }


    loadMyTournament();


    if (tournamentsLoaded) {
      renderHome();
    }

  }
);


/* =========================
   LOAD TOURNAMENTS
========================= */

function loadTournaments() {

  console.log(
    "🔥 Starting tournament listener..."
  );


  const tournamentsRef =
    collection(
      db,
      "tournaments"
    );


  return onSnapshot(

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


            console.log(
              "🏆 Tournament:",
              document.id,
              data
            );


            return {
              id: document.id,
              ...data
            };

          }
        );


      tournaments.sort(
        (a, b) => {

          const aa =
            timestampMs(
              a.registrationEnd
            );

          const bb =
            timestampMs(
              b.registrationEnd
            );


          if (!aa && !bb) {
            return 0;
          }

          if (!aa) {
            return 1;
          }

          if (!bb) {
            return -1;
          }


          return aa - bb;

        }
      );


      tournamentsLoaded = true;


      console.log(
        "✅ Tournaments loaded:",
        tournaments.length
      );


      renderHome();

    },

    error => {

      console.error(
        "❌ FIRESTORE TOURNAMENT ERROR:",
        error
      );


      tournaments = [];
      tournamentsLoaded = true;


      if ($("app")) {

        $("app").innerHTML = `

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
                  error.message ||
                  "Unknown Firestore error"
                )}
              </p>

              <p>
                Please check Firestore rules
                and Firebase configuration.
              </p>

            </div>

          </section>

        `;

      }

    }

  );

}


/* =========================
   PUBLIC SETTINGS
========================= */

async function loadPublicSettings() {

  try {

    const s =
      await getDoc(
        doc(
          db,
          "adminSettings",
          "public"
        )
      );


    publicSettings =
      s.data() || {};


    const logo =
      publicSettings.logoUrl || "";


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
      publicSettings.splashUrl || "";


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

  } catch (e) {

    console.warn(
      "Public settings unavailable:",
      e
    );

  }

}


/* =========================
   JOINED IDS
========================= */

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


    const s =
      await getDocs(q);


    return new Set(
      s.docs.map(
        d =>
          d.data().tournamentId
      )
    );

  } catch (e) {

    console.warn(
      "Joined tournament check unavailable:",
      e
    );


    return new Set();

  }

}


/* =========================
   RENDER HOME
========================= */

function renderHome() {

  if (!$("app")) {
    console.error(
      "❌ #app element not found."
    );
    return;
  }


  console.log(
    "📦 Rendering tournaments:",
    tournaments.length
  );


  $("app").innerHTML = `

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
          tournaments.length > 0

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


/* =========================
   TOURNAMENT CARD
========================= */

function card(idOrT) {

  const t =
    typeof idOrT === "string"
      ? tournaments.find(
          x => x.id === idOrT
        )
      : idOrT;


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


  /* =========================
     FIRST PRIZE
  ========================= */

  const firstPrize =
    getFirstPrize(t);


  console.log(
    "🏆 Tournament Prize Debug:",
    {
      name: t.name,
      prize1: t.prize1,
      firstPrize: t.firstPrize,
      firstPrizeAmount: t.firstPrizeAmount,
      prizes: t.prizes,
      detectedFirstPrize: firstPrize
    }
  );


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


      <!-- =====================
           FIRST PRIZE DISPLAY
      ====================== -->

      <div
        class="first-prize-box"
        style="
          margin:10px 0 8px;
          padding:10px;
          text-align:center;
          border-radius:10px;
          background:rgba(255,193,7,0.12);
          border:1px solid rgba(255,193,7,0.35);
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
          ₹${Number(
            firstPrize || 0
          ).toLocaleString("en-IN")}
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
          class="btn primary"
          data-tour="${esc(t.id)}"
        >
          View / Join
        </button>

      </div>

    </article>

  `;

}


/* =========================
   TOURNAMENT DETAILS
========================= */

async function details(id) {

  const t =
    tournaments.find(
      x => x.id === id
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

      ${prizeRows(t.prizes, t)}

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
      ${esc(t.mode || "-")}

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
      class="btn primary"
      style="width:100%"
    >
      JOIN NOW
    </button>

  `);


  const joinButton =
    $("joinNow");


  if (joinButton) {

    joinButton.onclick = () => {

      if (currentUser) {

        joinForm(t);

      } else {

        renderAuth();

      }

    };

  }

}


/* =========================
   PRIZE DISPLAY
========================= */

function prizeRows(prizes, tournament = null) {

  /*
    If direct prize1 exists,
    include it as first prize.
  */

  if (
    tournament &&
    Number(tournament.prize1 || 0) > 0
  ) {

    const directPrize =
      Number(
        tournament.prize1
      );


    let html = `

      <div class="listrow">

        <b>
          🥇 1st Prize
        </b>

        <span
          style="float:right"
        >
          ₹${directPrize.toLocaleString(
            "en-IN"
          )}
        </span>

      </div>

    `;


    if (
      prizes &&
      typeof prizes === "object" &&
      !Array.isArray(prizes)
    ) {

      html += Object.entries(prizes)
        .filter(
          ([key]) =>
            ![
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
            ].includes(key)
        )
        .map(
          ([pos, amount]) => `

            <div class="listrow">

              <b>
                ${esc(pos)}
              </b>

              <span
                style="float:right"
              >
                ₹${Number(
                  amount || 0
                ).toLocaleString(
                  "en-IN"
                )}
              </span>

            </div>

          `
        )
        .join("");

    }


    return html;

  }


  if (
    !prizes ||
    typeof prizes !== "object"
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
          typeof item === "number"
        ) {

          return `

            <div class="listrow">

              <b>
                Prize
              </b>

              <span style="float:right">
                ₹${item.toLocaleString(
                  "en-IN"
                )}
              </span>

            </div>

          `;

        }


        if (
          item &&
          typeof item === "object"
        ) {

          const pos =
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
                ${esc(pos)}
              </b>

              <span style="float:right">
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
      ([pos, amount]) => {

        const value =
          amount &&
          typeof amount === "object"
            ? Number(
                amount.amount ??
                amount.prize ??
                amount.value ??
                0
              )
            : Number(amount || 0);


        return `

          <div class="listrow">

            <b>
              ${esc(pos)}
            </b>

            <span
              style="float:right"
            >
              ₹${value.toLocaleString(
                "en-IN"
              )}
            </span>

          </div>

        `;

      }
    )
    .join("");

}


/* =========================
   JOIN FORM
========================= */

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


      <button class="btn primary">
        Confirm Join
      </button>

    </form>

  `);


  $("joinForm").onsubmit =
    async e => {

      e.preventDefault();


      try {

        const token =
          await auth.currentUser
            .getIdToken();


        const r =
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


        const x =
          await r.json();


        if (!x.success) {

          throw new Error(
            x.message ||
            "Unable to join tournament."
          );

        }


        toast(x.message);

        closeModal();

        renderHome();

      } catch (x) {

        console.error(x);

        toast(
          x.message ||
          "Unable to join tournament."
        );

      }

    };

}


/* =========================
   MY TOURNAMENT LISTENER
========================= */

async function loadMyTournament() {

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


    onSnapshot(
      q,

      snapshot => {

        const mine =
          snapshot.docs.map(
            d => d.data()
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

  } catch (e) {

    console.warn(
      "My tournament error:",
      e
    );

  }

}


/* =========================
   LOAD MY TOURNAMENTS
========================= */

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


    const s =
      await getDocs(q);


    renderMyTournaments(
      s.docs.map(
        d => d.data()
      )
    );

  } catch (e) {

    console.error(e);

    toast(
      "Unable to load joined tournaments: " +
      e.message
    );

  }

}


/* =========================
   RENDER MY TOURNAMENTS
========================= */

function renderMyTournaments(mine) {

  if (!$("app")) return;


  $("app").innerHTML = `

    <h1>
      My Tournament
    </h1>


    ${
      mine.length

        ? mine.map(x => `

            <div
              class="card"
              data-mine-id="${esc(
                x.tournamentId
              )}"
            >

              <h3>
                ${esc(
                  x.tournamentName ||
                  "Tournament"
                )}
              </h3>


              <p>

                Character:
                ${esc(
                  x.characterName ||
                  ""
                )}

                ·

                BGMI ID:
                ${esc(
                  x.bgmiId ||
                  ""
                )}

              </p>


              <p>

                Joined:
                ${fmt(
                  x.joinedAt
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

              No joined tournaments.

            </div>

          `
    }

  `;


  mine.forEach(
    async x => {

      try {

        const rs =
          await getDoc(
            doc(
              db,
              "roomCredentials",
              x.tournamentId
            )
          );


        if (!rs.exists()) {
          return;
        }


        const el =
          document.querySelector(
            `[data-mine-id="${CSS.escape(
              x.tournamentId
            )}"] .room`
          );


        if (el) {

          const room =
            rs.data();


          el.innerHTML = `

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

        }

      } catch (e) {

        console.warn(
          "Room details unavailable:",
          e
        );

      }

    }
  );

}


/* =========================
   PROFILE
========================= */

function renderProfile() {

  if (!currentUser) {
    renderAuth();
    return;
  }


  getDoc(
    doc(
      db,
      "users",
      currentUser.uid
    )
  )
    .then(s => {

      const p =
        s.data() || {};


      openModal(`

        <h2>
          My Profile
        </h2>


        <p>

          <b>Name:</b>
          ${esc(
            p.name || ""
          )}

        </p>


        <p>

          <b>Mobile:</b>
          ${esc(
            p.mobile || ""
          )}

        </p>


        <p>

          <b>Age:</b>
          ${esc(
            p.age || ""
          )}

        </p>


        <p>

          <b>Email:</b>
          ${esc(
            p.email ||
            currentUser.email ||
            ""
          )}

        </p>


        <div class="fee">

          Wallet ₹${Number(
            p.walletBalance || 0
          ).toFixed(2)}

        </div>


        <div class="row">

          <button
            id="addMoney"
            class="btn primary"
          >
            Add Money
          </button>


          <button
            id="history"
            class="btn"
          >
            Transactions
          </button>


          <button
            id="joined"
            class="btn"
          >
            Joined Tournaments
          </button>


          <button
            id="logout"
            class="btn danger"
          >
            Logout
          </button>

        </div>

      `);


      $("logout").onclick =
        () => {

          signOut(auth)
            .then(closeModal);

        };


      $("addMoney").onclick =
        addMoney;


      $("history").onclick =
        transactions;


      $("joined").onclick =
        loadMyTournaments;

    })
    .catch(e => {

      console.error(e);

      toast(
        "Unable to load profile."
      );

    });

}


/* =========================
   ADD MONEY
========================= */

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


    const q =
      settings.data()?.qrUrl ||
      "";


    openModal(`

      <h2>
        Add Money
      </h2>


      ${
        q && isHttpUrl(q)

          ? `

            <img
              src="${esc(q)}"
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
            currentUser.email ||
            ""
          )}"
          placeholder="Email ID"
          required
        >


        <button
          class="btn primary"
        >
          Submit
        </button>

      </form>

    `);


    $("deposit").onsubmit =
      async e => {

        e.preventDefault();


        try {

          const token =
            await currentUser
              .getIdToken();


          const r =
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


          const x =
            await r.json();


          if (!x.success) {

            throw new Error(
              x.message ||
              "Unable to submit deposit."
            );

          }


          toast(x.message);

          closeModal();

        } catch (x) {

          console.error(x);

          toast(
            x.message ||
            "Unable to submit deposit."
          );

        }

      };

  } catch (e) {

    console.error(e);

    toast(
      "Unable to load payment settings."
    );

  }

}


/* =========================
   TRANSACTIONS
========================= */

async function transactions() {

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


    const s =
      await getDocs(q);


    const rows =
      s.docs
        .map(
          d => d.data()
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

          ? rows.map(x => `

              <div class="listrow">

                <b>
                  ${esc(
                    x.type ||
                    ""
                  )}
                </b>

                —

                ₹${Number(
                  x.amount || 0
                ).toFixed(2)}

                <br>

                <span class="muted">

                  ${esc(
                    x.description ||
                    ""
                  )}

                  ·

                  ${fmt(
                    x.createdAt
                  )}

                </span>

              </div>

            `).join("")

          : "No transactions."
      }

    `);

  } catch (e) {

    console.error(e);

    toast(
      "Unable to load transactions: " +
      e.message
    );

  }

}


/* =========================
   STATIC PAGES
========================= */

function renderStatic(
  title,
  body
) {

  if (!$("app")) return;


  $("app").innerHTML = `

    <article class="card">

      <h1>
        ${title}
      </h1>

      ${body}

    </article>

  `;

}


/* =========================
   ROUTING
========================= */

function route() {

  const h =
    location.hash ||
    "#home";


  if (h === "#my-tournaments") {

    loadMyTournaments();

  }

  else if (h === "#about") {

    renderStatic(
      "About Us",

      `

        <p>

          eSports24 is a tournament-registration
          platform concept for competitive BGMI events.
          Tournament information, entry rules, prizes
          and payment status should always be verified
          before joining.

        </p>

      `
    );

  }

  else if (h === "#terms") {

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
          Obtain appropriate legal and tax advice
          before launch.

        </p>

      `
    );

  }

  else if (h === "#privacy") {

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

          Use access controls and retention limits
          appropriate to the service.
          Users may contact support for
          data-related requests.

        </p>


        <p>

          Never collect UPI PIN, OTP, card PIN
          or banking passwords.

        </p>

      `
    );

  }

  else if (h === "#support") {

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
            class="btn primary"
          >
            Submit
          </button>

        </form>

      `
    );


    $("supportForm").onsubmit =
      async e => {

        e.preventDefault();


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


          e.target.reset();

        } catch (x) {

          console.error(x);

          toast(
            x.message
          );

        }

      };

  }

  else {

    renderHome();

  }

}


/* =========================
   START APP
========================= */

window.addEventListener(
  "hashchange",
  route
);


loadPublicSettings();


loadTournaments();


route();


/* =========================
   SPLASH
========================= */

setTimeout(
  () => {

    if ($("splash")) {
      $("splash").hidden = true;
    }

  },
  900
);
