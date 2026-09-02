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

/* =========================
FIREBASE
========================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/* =========================
GLOBAL STATE
========================= */

const $ = id => document.getElementById(id);

let currentUser = null;
let tournaments = [];
let publicSettings = {};

let tournamentsLoaded = false;

let tournamentUnsubscribe = null;
let myTournamentUnsubscribe = null;

let appStarted = false;

/* =========================
HELPERS
========================= */

function toast(message) {

const el = $("toast");

if (!el) {
alert(message);
return;
}

el.textContent = message;
el.classList.add("show");

setTimeout(() => {
el.classList.remove("show");
}, 3000);
}

function openModal(html) {

const modal = $("modal");

if (!modal) return;

modal.innerHTML = `
<div class="modal-backdrop">
<div class="modal-box">

<button  
      class="modal-close"  
      onclick="closeModal()"  
    >  
      ×  
    </button>  

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

function isHttpUrl(value) {

try {

const url = new URL(value);  

return (  
  url.protocol === "http:" ||  
  url.protocol === "https:"  
);

} catch {

return false;

}

}

function esc(value) {

return String(value ?? "")
.replace(/&/g, "&")
.replace(/</g, "<")
.replace(/>/g, ">")
.replace(/"/g, """)
.replace(/'/g, "'");

}

function fmt(value) {

if (!value) return "—";

let date;

if (value?.toDate) {
date = value.toDate();
} else if (value instanceof Date) {
date = value;
} else {
date = new Date(value);
}

if (Number.isNaN(date.getTime())) {
return "—";
}

return date.toLocaleString("en-IN", {
dateStyle: "medium",
timeStyle: "short"
});

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

function isTournamentFree(tournament) {

const fee = Number(
tournament?.entryFee ??
tournament?.entry_fee ??
tournament?.fee ??
0
);

return fee <= 0;

}

/* =========================
PRIZE HELPERS
========================= */

function getFirstPrize(tournament) {

const prize =
tournament?.prizeDistribution ||
tournament?.prizes ||
tournament?.prize ||
{};

if (Array.isArray(prize)) {

const first = prize[0];  

if (typeof first === "object") {  

  return (  
    first.amount ??  
    first.prize ??  
    first.value ??  
    0  
  );  

}  

return first ?? 0;

}

if (typeof prize === "object") {

return (  
  prize["1"] ??  
  prize.first ??  
  prize.firstPrize ??  
  prize["1st"] ??  
  0  
);

}

return prize || 0;

}

/* =========================
MODAL BACKDROP
========================= */

document.addEventListener("click", event => {

const modal = $("modal");

if (
modal &&
event.target === modal
) {
closeModal();
}

});

/* =========================
AUTH BUTTON
========================= */

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

/* =========================
LOGIN
========================= */

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
  style="margin-top:10px;width:100%;"  
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

$("loginForm").onsubmit =
async event => {

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

    toast(  
      error.message ||  
      "Login failed."  
    );  

  }  

};

$("googleLogin").onclick =
async () => {

try {  

    await signInWithPopup(  
      auth,  
      provider  
    );  

    closeModal();  

    toast("Google login successful.");  

  } catch (error) {  

    console.error(error);  

    toast(  
      error.message ||  
      "Google login failed."  
    );  

  }  

};

$("openSignup").onclick = openSignup;

}

/* =========================
SIGN UP
========================= */

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
    placeholder="Password"  
    minlength="6"  
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

$("signupForm").onsubmit =
async event => {

event.preventDefault();  

  try {  

    const name =  
      $("signupName")  
        .value  
        .trim();  

    const email =  
      $("signupEmail")  
        .value  
        .trim();  

    const password =  
      $("signupPassword")  
        .value;  

    const mobile =  
      $("signupMobile")  
        .value  
        .trim();  


    const credential =  
      await createUserWithEmailAndPassword(  
        auth,  
        email,  
        password  
      );  


    await setDoc(  
      doc(  
        db,  
        "users",  
        credential.user.uid  
      ),  
      {  
        uid: credential.user.uid,  
        name,  
        email,  
        mobile,  
        walletBalance: 0,  
        role: "user",  
        createdAt: serverTimestamp()  
      },  
      {  
        merge: true  
      }  
    );  


    closeModal();  

    toast(  
      "Account created successfully."  
    );  

  } catch (error) {  

    console.error(error);  

    toast(  
      error.message ||  
      "Signup failed."  
    );  

  }  

};

}

/* =========================
SAVE PROFILE
========================= */

async function saveProfile() {

if (!currentUser) {

toast("Please login first.");  

return;

}

const name =
$("profileName")?.value.trim() || "";

const mobile =
$("profileMobile")?.value.trim() || "";

try {

const userRef =  
  doc(  
    db,  
    "users",  
    currentUser.uid  
  );  


const existing =  
  await getDoc(userRef);  


if (existing.exists()) {  

  await setDoc(  
    userRef,  
    {  
      name,  
      mobile,  
      email:  
        currentUser.email || ""  
    },  
    {  
      merge: true  
    }  
  );  

} else {  

  await setDoc(  
    userRef,  
    {  
      uid:  
        currentUser.uid,  

      name,  

      mobile,  

      email:  
        currentUser.email || "",  

      walletBalance: 0,  

      role: "user",  

      createdAt:  
        serverTimestamp()  
    }  
  );  

}  


toast("Profile saved.");

} catch (error) {

console.error(error);  

toast(  
  error.message ||  
  "Unable to save profile."  
);

}

}

/* =========================
AUTH STATE
========================= */

onAuthStateChanged(
auth,
async user => {

currentUser = user || null;  


if (authBtn) {  

  authBtn.textContent =  
    currentUser  
      ? "Profile"  
      : "Login";  

}  


if (currentUser) {  

  try {  

    const userRef =  
      doc(  
        db,  
        "users",  
        currentUser.uid  
      );  


    const snap =  
      await getDoc(userRef);  


    if (!snap.exists()) {  

      await setDoc(  
        userRef,  
        {  
          uid:  
            currentUser.uid,  

          name:  
            currentUser.displayName ||  
            "",  

          email:  
            currentUser.email ||  
            "",  

          walletBalance: 0,  

          role: "user",  

          createdAt:  
            serverTimestamp()  
        }  
      );  

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

}
);

/* =========================
LOAD TOURNAMENTS
========================= */

function loadTournaments() {

if (tournamentUnsubscribe) {

tournamentUnsubscribe();

}

tournamentUnsubscribe =
onSnapshot(
collection(db, "tournaments"),

snapshot => {  

    tournaments =  
      snapshot.docs.map(  
        item => ({  
          id: item.id,  
          ...item.data()  
        })  
      );  


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

/* =========================
PUBLIC SETTINGS
========================= */

async function loadPublicSettings() {

try {

const snap =  
  await getDoc(  
    doc(  
      db,  
      "adminSettings",  
      "public"  
    )  
  );  


if (!snap.exists()) {  

  return;  

}  


publicSettings =  
  snap.data() || {};  


if (  
  publicSettings.logoUrl &&  
  isHttpUrl(  
    publicSettings.logoUrl  
  )  
) {  

  const logos =  
    document.querySelectorAll(  
      ".site-logo"  
    );  


  logos.forEach(  
    logo => {  

      logo.src =  
        publicSettings.logoUrl;  

    }  
  );  

}  


if (  
  publicSettings.splashUrl &&  
  isHttpUrl(  
    publicSettings.splashUrl  
  )  
) {  

  const splash =  
    $("splashImage");  


  if (splash) {  

    splash.src =  
      publicSettings.splashUrl;  

  }  

}

} catch (error) {

console.error(  
  "Public settings error:",  
  error  
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


const snap =  
  await getDocs(q);  


return new Set(  
  snap.docs.map(  
    d =>  
      d.data().tournamentId  
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

/* =========================
HOME
========================= */

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

const joined =
await joinedIds();

const active =
tournaments.filter(
tournament =>
!tournament.status ||
tournament.status === "active" ||
tournament.status === "upcoming"
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

  <h1>  
    BGMI Tournaments  
  </h1>  

  <p>  
    Join and win exciting prizes.  
  </p>  

</div>  


<div class="tournament-grid">  

  ${  
    active  
      .map(  
        tournament =>  
          card(  
            tournament,  
            joined.has(  
              tournament.id  
            )  
          )  
      )  
      .join("")  
  }  

</div>

`;

}

/* =========================
TOURNAMENT CARD
========================= */

function card(
tournament,
joined = false
) {

const firstPrize =
getFirstPrize(tournament);

const mode =
tournament.mode ||
tournament.gameMode ||
"Squad";

const slots =
tournament.slots ||
tournament.maxSlots ||
tournament.totalSlots ||
0;

const joinedCount =
Number(
tournament.joinedCount || 0
);

const matchDate =
tournament.matchDateTime ||
tournament.matchDate ||
tournament.date;

const perKill =
Number(
tournament.perKill ??
tournament.perKillPrize ??
tournament.killPrize ??
0
);

const free =
isTournamentFree(
tournament
);

return `

<article class="tournament-card">  

  ${  
    tournament.imageUrl &&  
    isHttpUrl(  
      tournament.imageUrl  
    )  
      ? `  
        <img  
          class="tournament-image"  
          src="${esc(  
            tournament.imageUrl  
          )}"  
          alt="${esc(  
            tournament.name  
          )}"  
        >  
      `  
      : ""  
  }  


  <div class="tournament-content">  

    <h3>  
      ${esc(tournament.name)}  
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
      📅 ${esc(fmt(matchDate))}  
    </div>  


    <div class="meta">  
      🎯 Kill ₹${esc(perKill)}  
    </div>  


    <div class="entry">  

      ${  
        free  
          ? "FREE"  
          : "Entry ₹" +  
            Number(  
              tournament.entryFee ||  
              0  
            )  
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
            onclick="showDetails('${esc(  
              tournament.id  
            )}')"  
          >  
            View Details  
          </button>  
        `  
    }  

  </div>  

</article>

`;

}

/* =========================
TOURNAMENT DETAILS
========================= */

window.showDetails =
function (id) {

const tournament =  
  tournaments.find(  
    item =>  
      item.id === id  
  );  


if (!tournament) {  

  toast(  
    "Tournament not found."  
  );  

  return;  

}  


details(tournament);

};

function details(tournament) {

const firstPrize =
getFirstPrize(tournament);

const mode =
tournament.mode ||
tournament.gameMode ||
"Squad";

const slots =
tournament.slots ||
tournament.maxSlots ||
tournament.totalSlots ||
0;

const joinedCount =
Number(
tournament.joinedCount || 0
);

const perKill =
Number(
tournament.perKill ??
tournament.perKillPrize ??
tournament.killPrize ??
0
);

const entryFee =
Number(
tournament.entryFee || 0
);

const matchDate =
tournament.matchDateTime ||
tournament.matchDate ||
tournament.date;

openModal(`

<h2>  
  ${esc(tournament.name)}  
</h2>  


<div class="details-list">  

  <p>  
    🏆 First Prize:  
    <strong>  
      ₹${esc(firstPrize)}  
    </strong>  
  </p>  


  <p>  
    💰 Total Prize:  
    <strong>  
      ₹${esc(  
        tournament.totalPrize ||  
        tournament.prizeTotal ||  
        tournament.prizePool ||  
        0  
      )}  
    </strong>  
  </p>  


  <p>  
    🎮 Mode:  
    ${esc(mode)}  
  </p>  


  <p>  
    👥 Slots:  
    ${joinedCount}/${slots}  
  </p>  


  <p>  
    📅 Registration End:  
    ${esc(  
      fmt(  
        tournament.registrationEnd ||  
        tournament.regEnd  
      )  
    )}  
  </p>  


  <p>  
    🕐 Match Date:  
    ${esc(  
      fmt(matchDate)  
    )}  
  </p>  


  <p>  
    💵 Entry Fee:  
    ${  
      entryFee <= 0  
        ? "FREE"  
        : "₹" + entryFee  
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
        ${esc(  
          tournament.description  
        )}  
      </div>  
    `  
    : ""  
}  


<div class="warning">  
  ⚠️ Never share your OTP,  
  password or Firebase account  
  details with anyone.  
</div>  


<button  
  class="btn primary"  
  style="width:100%;margin-top:15px;"  
  onclick="joinTournament('${esc(  
    tournament.id  
  )}')"  
>  
  JOIN NOW  
</button>

`);

}

/* =========================
PRIZE ROWS
========================= */

function prizeRows(tournament) {

const prizes =
tournament.prizeDistribution ||
tournament.prizes ||
[];

if (!Array.isArray(prizes)) {

return "";

}

return prizes
.map(
(item, index) => {

const amount =  
      typeof item === "object"  
        ? (  
            item.amount ??  
            item.prize ??  
            item.value ??  
            0  
          )  
        : item;  


    return `  

      <div class="prize-row">  

        <span>  
          ${index + 1}  
        </span>  

        <strong>  
          ₹${esc(amount)}  
        </strong>  

      </div>  

    `;  

  }  
)  
.join("");

}

/* =========================
START MY TOURNAMENT LISTENER
========================= */

function startMyTournamentListener() {

if (!currentUser) return;

if (myTournamentUnsubscribe) {

myTournamentUnsubscribe();

}

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

    window.myTournamentDocs =  
      snapshot.docs.map(  
        item => ({  
          id: item.id,  
          ...item.data()  
        })  
      );  


    if (  
      location.hash ===  
      "#my-tournaments"  
    ) {  

      renderMyTournaments();  

    }  

  },  

  error => {  

    console.error(  
      "My tournament listener:",  
      error  
    );  

  }  
);

}

/* =========================
LOAD MY TOURNAMENTS
========================= */

async function loadMyTournaments() {

if (!currentUser) {

return [];

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


const snap =  
  await getDocs(q);  


return snap.docs.map(  
  item => ({  
    id: item.id,  
    ...item.data()  
  })  
);

} catch (error) {

console.error(  
  "Load my tournaments:",  
  error  
);  

return [];

}

}

/* =========================
MY TOURNAMENTS
========================= */

async function renderMyTournaments() {

const appEl = $("app");

if (!appEl) return;

if (!currentUser) {

openLogin();  

return;

}

const joined =
await loadMyTournaments();

if (!joined.length) {

appEl.innerHTML = `  
  <div class="empty">  
    You have not joined  
    any tournament yet.  
  </div>  
`;  

return;

}

const cards = [];

for (const participant of joined) {

const tournament =  
  tournaments.find(  
    t =>  
      t.id ===  
      participant.tournamentId  
  );  


if (!tournament) continue;  


let room = null;  


try {  

  const roomSnap =  
    await getDoc(  
      doc(  
        db,  
        "roomCredentials",  
        tournament.id  
      )  
    );  


  if (roomSnap.exists()) {  

    room =  
      roomSnap.data();  

  }  

} catch (error) {  

  console.error(  
    "Room credentials:",  
    error  
  );  

}  


cards.push(`  

  <article class="tournament-card">  

    <div class="tournament-content">  

      <h3>  
        ${esc(tournament.name)}  
      </h3>  


      <p>  
        👤 Character:  
        ${esc(  
          participant.characterName  
        )}  
      </p>  


      <p>  
        🆔 BGMI ID:  
        ${esc(  
          participant.bgmiId  
        )}  
      </p>  


      ${  
        room  
          ? `  
            <div class="room-box">  

              <p>  
                🎮 Room ID:  
                <strong>  
                  ${esc(  
                    room.roomId ||  
                    "—"  
                  )}  
                </strong>  
              </p>  


              <p>  
                🔑 Password:  
                <strong>  
                  ${esc(  
                    room.roomPassword ||  
                    room.password ||  
                    "—"  
                  )}  
                </strong>  
              </p>  

            </div>  
          `  
          : `  
            <p>  
              ⏳ Room details will  
              appear here when  
              published.  
            </p>  
          `  
      }  

    </div>  

  </article>  

`);

}

appEl.innerHTML = `

<div class="section-title">  

  <h1>  
    My Tournaments  
  </h1>  

</div>  


<div class="tournament-grid">  

  ${  
    cards.length  
      ? cards.join("")  
      : `  
        <div class="empty">  
          No tournament data found.  
        </div>  
      `  
  }  

</div>

`;

}

/* =========================
PROFILE
========================= */

async function renderProfile() {

if (!currentUser) {

openLogin();  

return;

}

let profile = {};

try {

const snap =  
  await getDoc(  
    doc(  
      db,  
      "users",  
      currentUser.uid  
    )  
  );  


if (snap.exists()) {  

  profile =  
    snap.data() || {};  

}

} catch (error) {

console.error(error);

}

const wallet =
Number(
profile.walletBalance || 0
);

openModal(`

<h2>My Profile</h2>  


<div class="wallet-box">  

  <div>  
    Wallet Balance  
  </div>  

  <strong>  
    ₹${wallet.toFixed(2)}  
  </strong>  

</div>  


<form  
  id="profileForm"  
  class="formgrid"  
>  

  <input  
    id="profileName"  
    value="${esc(  
      profile.name ||  
      currentUser.displayName ||  
      ""  
    )}"  
    placeholder="Name"  
  >  


  <input  
    id="profileMobile"  
    value="${esc(  
      profile.mobile || ""  
    )}"  
    placeholder="Mobile number"  
  >  


  <button  
    class="btn primary"  
    type="submit"  
  >  
    Save Profile  
  </button>  

</form>  


<button  
  class="btn"  
  style="width:100%;margin-top:10px;"  
  onclick="addMoney()"  
>  
  💰 Add Money  
</button>  


<button  
  class="btn"  
  style="width:100%;margin-top:10px;"  
  onclick="transactions()"  
>  
  📜 Transactions  
</button>  


<button  
  class="btn"  
  style="width:100%;margin-top:10px;"  
  onclick="location.hash='my-tournaments';closeModal();route();"  
>  
  🏆 Joined Tournaments  
</button>  


<button  
  class="btn danger"  
  style="width:100%;margin-top:10px;"  
  onclick="logoutUser()"  
>  
  Logout  
</button>

`);

$("profileForm").onsubmit =
async event => {

event.preventDefault();  

  await saveProfile();  

};

}

/* =========================
ADD MONEY
MANUAL PAYMENT
========================= */

window.addMoney =
async function () {

/* ---------- LOGIN CHECK ---------- */  

if (!auth.currentUser) {  

  toast("Please login first.");  

  openLogin();  

  return;  

}  


/* ---------- REFRESH USER ---------- */  

try {  

  await auth.currentUser.reload();  

  currentUser =  
    auth.currentUser;  

} catch (error) {  

  console.error(  
    "Auth refresh error:",  
    error  
  );  

}  


if (!currentUser) {  

  toast(  
    "Login session expired. Please login again."  
  );  

  openLogin();  

  return;  

}  


/* ---------- QR ---------- */  

let qrHtml = `  

  <div  
    style="  
      margin:15px 0;  
      padding:12px;  
      text-align:center;  
      background:#f5f5f5;  
      border-radius:12px;  
    "  
  >  

    <p style="margin:0;">  
      Payment QR not configured.  
    </p>  

  </div>  

`;  


if (  
  publicSettings.qrUrl &&  
  isHttpUrl(  
    publicSettings.qrUrl  
  )  
) {  

  qrHtml = `  

    <div  
      style="  
        text-align:center;  
        margin:15px 0;  
      "  
    >  

      <img  
        src="${esc(  
          publicSettings.qrUrl  
        )}"  
        alt="Payment QR"  
        style="  
          display:block;  
          max-width:220px;  
          width:100%;  
          height:auto;  
          margin:0 auto;  
          border-radius:10px;  
          background:#fff;  
        "  
        onerror="  
          this.style.display='none';  
          this.nextElementSibling.style.display='block';  
        "  
      >  

      <div  
        style="  
          display:none;  
          padding:15px;  
          background:#fff3cd;  
          border-radius:10px;  
          margin-top:10px;  
        "  
      >  
        Payment QR image could not be loaded.  
      </div>  

    </div>  

  `;  

}  


/* ---------- MODAL ---------- */  

openModal(`  

  <h2>  
    Add Money  
  </h2>  


  <p>  
    Pay using the QR code and submit  
    your UTR / Transaction ID.  
  </p>  


  ${qrHtml}  


  <form  
    id="depositForm"  
    class="formgrid"  
  >  

    <input  
      id="depositAmount"  
      type="number"  
      min="1"  
      max="50000"  
      step="1"  
      inputmode="numeric"  
      placeholder="Amount ₹"  
      required  
    >  


    <input  
      id="depositUtr"  
      type="text"  
      minlength="4"  
      maxlength="100"  
      autocomplete="off"  
      placeholder="UTR / Transaction ID"  
      required  
    >  


    <input  
      id="depositMobile"  
      type="tel"  
      maxlength="20"  
      placeholder="Mobile number"  
      required  
    >  


    <input  
      id="depositEmail"  
      type="email"  
      placeholder="Email"  
      value="${esc(  
        currentUser.email || ""  
      )}"  
      required  
    >  


    <button  
      id="depositSubmitBtn"  
      type="submit"  
      class="btn primary"  
    >  
      Submit Deposit  
    </button>  

  </form>  

`);  


const form =  
  $("depositForm");  


const submitBtn =  
  $("depositSubmitBtn");  


if (!form) {  

  toast(  
    "Deposit form could not be loaded."  
  );  

  return;  

}  


/* ---------- FORM SUBMIT ---------- */  

form.onsubmit =  
  async function (event) {  

    event.preventDefault();  


    if (  
      submitBtn &&  
      submitBtn.disabled  
    ) {  

      return;  

    }  


    try {  

      const user =  
        auth.currentUser;  


      if (!user) {  

        throw new Error(  
          "Login session expired. Please login again."  
        );  

      }  


      const amountRaw =  
        $("depositAmount")  
          ?.value  
          ?.trim() || "";  


      const utr =  
        $("depositUtr")  
          ?.value  
          ?.trim() || "";  


      const mobile =  
        $("depositMobile")  
          ?.value  
          ?.trim() || "";  


      const email =  
        $("depositEmail")  
          ?.value  
          ?.trim() || "";  


      const amount =  
        Number(amountRaw);  


      if (  
        !Number.isFinite(amount) ||  
        !Number.isInteger(amount) ||  
        amount < 1 ||  
        amount > 50000  
      ) {  

        throw new Error(  
          "Amount must be a whole number between ₹1 and ₹50,000."  
        );  

      }  


      if (!utr) {  

        throw new Error(  
          "UTR / Transaction ID is required."  
        );  

      }  


      if (utr.length < 4) {  

        throw new Error(  
          "Please enter a valid UTR / Transaction ID."  
        );  

      }  


      if (!mobile) {  

        throw new Error(  
          "Mobile number is required."  
        );  

      }  


      if (!email) {  

        throw new Error(  
          "Email is required."  
        );  

      }  


      if (submitBtn) {  

        submitBtn.disabled = true;  

        submitBtn.textContent =  
          "Submitting...";  

      }  


      const depositRef =  
        await addDoc(  
          collection(  
            db,  
            "depositRequests"  
          ),  
          {  

            uid:  
              user.uid,  

            amount:  
              amount,  

            utr:  
              utr,  

            mobile:  
              mobile,  

            email:  
              email,  

            status:  
              "pending",  

            createdAt:  
              serverTimestamp(),  

            updatedAt:  
              serverTimestamp()  

          }  
        );  


      console.log(  
        "Deposit request created:",  
        depositRef.id  
      );  


      toast(  
        "Deposit request submitted successfully."  
      );  


      closeModal();  


    } catch (error) {  

      console.error(  
        "========== DEPOSIT ERROR =========="  
      );  

      console.error(  
        "Error object:",  
        error  
      );  

      console.error(  
        "Error code:",  
        error?.code  
      );  

      console.error(  
        "Error message:",  
        error?.message  
      );  

      console.error(  
        "==================================="  
      );  


      if (submitBtn) {  

        submitBtn.disabled = false;  

        submitBtn.textContent =  
          "Submit Deposit";  

      }  


      let message =  
        "Unable to submit deposit request.";  


      if (  
        error?.code ===  
        "permission-denied"  
      ) {  

        message =  
          "Firebase permission denied. Firestore Rules check karein.";  

      } else if (  
        error?.code ===  
        "unauthenticated"  
      ) {  

        message =  
          "Login session expired. Please login again.";  

      } else if (  
        error?.code ===  
        "failed-precondition"  
      ) {  

        message =  
          "Firestore configuration/index problem.";  

      } else if (  
        error?.code ===  
        "unavailable"  
      ) {  

        message =  
          "Firebase server temporarily unavailable. Internet check karke dobara try karein.";  

      } else if (  
        error?.message  
      ) {  

        message =  
          error.message;  

      }  


      toast(message);  

    }  

  };

};

/* =========================
TRANSACTIONS
========================= */

window.transactions =
async function () {

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
      .map(  
        item => ({  
          id:  
            item.id,  

          ...item.data()  
        })  
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
      Transactions  
    </h2>  


    ${  
      rows.length  
        ? rows  
            .map(  
              transaction => {  

                const amount =  
                  Number(  
                    transaction.amount ||  
                    0  
                  );  


                return `  

                  <div  
                    class="transaction-row"  
                    style="  
                      padding:12px 0;  
                      border-bottom:1px solid #ddd;  
                    "  
                  >  

                    <strong>  

                      ${  
                        amount >= 0  
                          ? "+"  
                          : ""  
                      }₹${amount}  

                    </strong>  


                    <div>  
                      ${esc(  
                        transaction.description ||  
                        transaction.type ||  
                        "Transaction"  
                      )}  
                    </div>  


                    <small>  
                      ${esc(  
                        fmt(  
                          transaction.createdAt  
                        )  
                      )}  
                    </small>  

                  </div>  

                `;  

              }  
            )  
            .join("")  

        : `  

          <p>  
            No transactions found.  
          </p>  

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

/* =========================
LOGOUT
========================= */

window.logoutUser =
async function () {

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

/* =========================
JOIN TOURNAMENT
========================= */

window.joinTournament =
async function (tournamentId) {

const tournament =  
  tournaments.find(  
    item =>  
      item.id ===  
      tournamentId  
  );  


if (!tournament) {  

  toast(  
    "Tournament not found."  
  );  

  return;  

}  


if (!currentUser) {  

  toast(  
    "Please login first."  
  );  

  openLogin();  

  return;  

}  


joinForm(tournament);

};

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


  const submitBtn =  
    $("joinSubmitBtn");  


  if (  
    submitBtn &&  
    submitBtn.disabled  
  ) {  

    return;  

  }  


  try {  

    if (!auth.currentUser) {  

      throw new Error(  
        "Please login first."  
      );  

    }  


    const characterName =  
      $("cname")  
        .value  
        .trim();  


    const bgmiId =  
      $("bgmi")  
        .value  
        .trim();  


    const whatsapp =  
      $("wa")  
        .value  
        .trim();  


    const upiId =  
      $("upi")  
        .value  
        .trim();  


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


    const uid =  
      auth.currentUser.uid;  


    const participantId =  
      `${uid}_${t.id}`;  


    const duplicateQuery =  
      query(  
        collection(  
          db,  
          "tournamentParticipants"  
        ),  

        where(  
          "uid",  
          "==",  
          uid  
        ),  

        where(  
          "tournamentId",  
          "==",  
          t.id  
        )  
      );  


    const duplicateSnapshot =  
      await getDocs(  
        duplicateQuery  
      );  


    if (  
      !duplicateSnapshot.empty  
    ) {  

      throw new Error(  
        "You have already joined this tournament."  
      );  

    }  


    const tournamentRef =  
      doc(  
        db,  
        "tournaments",  
        t.id  
      );  


    const participantRef =  
      doc(  
        db,  
        "tournamentParticipants",  
        participantId  
      );  


    if (submitBtn) {  

      submitBtn.disabled = true;  

      submitBtn.textContent =  
        "Joining...";  

    }  


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


        if (  
          !tournamentSnap.exists()  
        ) {  

          throw new Error(  
            "Tournament no longer exists."  
          );  

        }  


        if (  
          participantSnap.exists()  
        ) {  

          throw new Error(  
            "You have already joined this tournament."  
          );  

        }  


        const tournamentData =  
          tournamentSnap.data() || {};  


        /* ---------- STATUS ---------- */  

        if (  
          tournamentData.status ===  
          "closed"  
        ) {  

          throw new Error(  
            "Registration is closed."  
          );  

        }  


        if (  
          tournamentData.status ===  
          "completed"  
        ) {  

          throw new Error(  
            "This tournament has already ended."  
          );  

        }  


        /* ---------- REGISTRATION END ---------- */  

        const registrationEnd =  
          tournamentData.registrationEnd ||  
          tournamentData.regEnd;  


        if (  
          registrationEnd &&  
          timestampMs(  
            registrationEnd  
          ) > 0 &&  
          Date.now() >  
            timestampMs(  
              registrationEnd  
            )  
        ) {  

          throw new Error(  
            "Registration has ended."  
          );  

        }  


        /* ---------- SLOTS ---------- */  

        const maxSlots =  
          Number(  
            tournamentData.slots ||  
            tournamentData.maxSlots ||  
            tournamentData.totalSlots ||  
            0  
          );  


        const joinedCount =  
          Number(  
            tournamentData.joinedCount ||  
            0  
          );  


        if (  
          maxSlots > 0 &&  
          joinedCount >= maxSlots  
        ) {  

          throw new Error(  
            "Tournament slots are full."  
          );  

        }  


        /* ---------- ENTRY FEE ---------- */  

        const entryFee =  
          Math.max(  
            0,  
            Number(  
              tournamentData.entryFee ||  
              0  
            )  
          );  


        /*  
         * IMPORTANT:  
         *  
         * With secure Firestore Rules,  
         * normal users must NOT be allowed  
         * to change walletBalance.  
         *  
         * Therefore paid tournament joining  
         * must be processed server-side.  
         */  

        if (entryFee > 0) {  

          throw new Error(  
            "Paid tournament entry is temporarily unavailable. Secure wallet payment setup required."  
          );  

        }  


        /* ---------- PARTICIPANT ---------- */  

        transaction.set(  
          participantRef,  
          {  

            uid,  

            tournamentId:  
              t.id,  

            tournamentName:  
              tournamentData.name ||  
              t.name ||  
              "",  

            characterName,  

            bgmiId,  

            whatsapp,  

            upiId,  

            entryFee: 0,  

            joinedAt:  
              serverTimestamp()  

          }  
        );  

      }  
    );  


    toast(  
      "Tournament joined successfully."  
    );  


    closeModal();  


    await renderHome();  


  } catch (error) {  

    console.error(  
      "Join error:",  
      error  
    );  


    if (submitBtn) {  

      submitBtn.disabled = false;  

      submitBtn.textContent =  
        "Confirm Join";  

    }  


    toast(  
      error.message ||  
      "Unable to join tournament."  
    );  

  }  

};

}

/* =========================
STATIC PAGES
========================= */

function renderStatic(page) {

const appEl = $("app");

if (!appEl) return;

if (page === "about") {

appEl.innerHTML = `  

  <div class="static-page">  

    <h1>  
      About eSports24  
    </h1>  

    <p>  
      eSports24 is a BGMI tournament  
      platform where players can join  
      tournaments and compete for prizes.  
    </p>  

  </div>  

`;  

return;

}

if (page === "terms") {

appEl.innerHTML = `  

  <div class="static-page">  

    <h1>  
      Terms & Conditions  
    </h1>  

    <p>  
      Players must provide correct  
      tournament information and follow  
      tournament rules.  
    </p>  

  </div>  

`;  

return;

}

if (page === "privacy") {

appEl.innerHTML = `  

  <div class="static-page">  

    <h1>  
      Privacy Policy  
    </h1>  

    <p>  
      User information is used for  
      account, tournament and payment  
      related functionality.  
    </p>  

  </div>  

`;  

return;

}

if (page === "support") {

appEl.innerHTML = `  

  <div class="static-page">  

    <h1>  
      Support  
    </h1>  


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
        type="submit"  
        class="btn primary"  
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

      toast(  
        "Please login first."  
      );  

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


      if (!subject) {  

        throw new Error(  
          "Subject is required."  
        );  

      }  


      if (!message) {  

        throw new Error(  
          "Message is required."  
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
            currentUser.email ||  
            "",  

          subject,  

          message,  

          status:  
            "open",  

          createdAt:  
            serverTimestamp()  

        }  
      );  


      toast(  
        "Support message sent."  
      );  


      $("supportForm")  
        .reset();  

    } catch (error) {  

      console.error(error);  

      toast(  
        error.message ||  
        "Unable to send message."  
      );  

    }  

  };

}

}

/* =========================
ROUTER
========================= */

async function route() {

const hash =
location.hash
.replace("#", "")
.trim();

if (
hash === "" ||
hash === "home"
) {

await renderHome();  

return;

}

if (
hash === "my-tournaments"
) {

await renderMyTournaments();  

return;

}

if (
hash === "about" ||
hash === "terms" ||
hash === "privacy" ||
hash === "support"
) {

renderStatic(hash);  

return;

}

await renderHome();

}

window.route = route;

window.addEventListener(
"hashchange",
route
);

/* =========================
SPLASH
========================= */

function hideSplash() {

const splash =
$("splash");

if (!splash) return;

splash.classList.add(
"hidden"
);

setTimeout(() => {

splash.style.display =  
  "none";

}, 500);

}

/* =========================
ERROR HANDLERS
========================= */

window.addEventListener(
"error",
event => {

console.error(  
  "Global error:",  
  event.error ||  
  event.message  
);

}
);

window.addEventListener(
"unhandledrejection",
event => {

console.error(  
  "Unhandled promise rejection:",  
  event.reason  
);

}
);

/* =========================
START APP
========================= */

async function startApp() {

if (appStarted) return;

appStarted = true;

try {

loadTournaments();  

await loadPublicSettings();  

await route();

} catch (error) {

console.error(  
  "App start error:",  
  error  
);  


const appEl =  
  $("app");  


if (appEl) {  

  appEl.innerHTML = `  

    <div class="empty">  

      Unable to start app.  
      Please refresh the page.  

    </div>  

  `;  

}

} finally {

hideSplash();

}

}

/* =========================
DOM READY
========================= */

if (
document.readyState ===
"loading"
) {

document.addEventListener(
"DOMContentLoaded",
startApp
);

} else {

startApp();

}
