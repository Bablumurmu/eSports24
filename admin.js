import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
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
  setDoc,
  addDoc,
  serverTimestamp,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);

function isHttpUrl(v) {
  try {
    const u = new URL(String(v || "").trim());
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");

  setTimeout(() => {
    $("toast").classList.remove("show");
  }, 2500);
}

async function isAdmin(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() && snap.data().role === "admin";
}


/* =========================
   AUTH
========================= */

onAuthStateChanged(auth, async user => {
  if (!user) {
    $("dashboard").hidden = true;
    $("adminLoginCard").hidden = false;
    return;
  }

  try {
    const admin = await isAdmin(user.uid);

    if (!admin) {
      toast("Not authorized as admin.");
      await signOut(auth);
      return;
    }

    $("adminLoginCard").hidden = true;
    $("dashboard").hidden = false;

    load();
  } catch (error) {
    toast(error.message);
  }
});


$("adminLoginForm").onsubmit = async e => {
  e.preventDefault();

  try {
    await signInWithEmailAndPassword(
      auth,
      $("adminEmail").value.trim(),
      $("adminPassword").value
    );
  } catch (error) {
    toast(error.message);
  }
};


$("adminLogout").onclick = () => signOut(auth);


/* =========================
   LOAD ADMIN DATA
========================= */

async function load() {

  try {
    const settings = await getDoc(
      doc(db, "adminSettings", "public")
    );

    const data = settings.data() || {};

    $("logoUrl").value = data.logoUrl || "";
    $("splashUrl").value = data.splashUrl || "";
    $("qrUrl").value = data.qrUrl || "";
  } catch (error) {
    console.warn("Settings unavailable:", error);
  }


  /* SETTINGS */

  $("settingsForm").onsubmit = async e => {
    e.preventDefault();

    try {
      const logo = $("logoUrl").value.trim();
      const splash = $("splashUrl").value.trim();
      const qr = $("qrUrl").value.trim();

      for (const [label, url] of [
        ["Logo", logo],
        ["Splash", splash],
        ["Payment QR", qr]
      ]) {
        if (url && !isHttpUrl(url)) {
          throw new Error(
            `${label} must be a valid HTTPS URL.`
          );
        }
      }

      await setDoc(
        doc(db, "adminSettings", "public"),
        {
          logoUrl: logo,
          splashUrl: splash,
          qrUrl: qr,
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser.uid
        }
      );

      toast("Settings saved.");
    } catch (error) {
      toast(error.message);
    }
  };


  /* FREE / PAID */

  $("tFree").onchange = () => {

    const free = $("tFree").value === "true";

    $("tFee").disabled = free;

    if (free) {
      $("tFee").value = 0;
    }
  };


  /* TOURNAMENT */

  $("tournamentForm").onsubmit = createTournament;


  /* ROOM */

  $("roomForm").onsubmit = roomUpdate;


  loadTournaments();
  loadPlayers();
}


/* =========================
   CREATE TOURNAMENT
========================= */

async function createTournament(e) {
  e.preventDefault();

  try {

    const name = $("tName").value.trim();
    const imageUrl = $("tImage").value.trim();
    const mode = $("tMode").value;
    const isFree = $("tFree").value === "true";

    const entryFee = Number(
      $("tFee").value || 0
    );

    const totalSlots = Number(
      $("tSlots").value || 0
    );

    /* PER KILL */
    const perKill = Number(
      $("tKill").value || 0
    );

    const registrationEnd = $("tReg").value;
    const matchDateTime = $("tDate").value;

    if (!name) {
      throw new Error("Tournament name is required.");
    }

    if (!isHttpUrl(imageUrl)) {
      throw new Error(
        "Tournament image must be a valid HTTPS URL."
      );
    }

    if (totalSlots < 1) {
      throw new Error(
        "Total slots must be at least 1."
      );
    }

    if (entryFee < 0) {
      throw new Error(
        "Entry fee cannot be negative."
      );
    }

    if (perKill < 0) {
      throw new Error(
        "Per kill cannot be negative."
      );
    }


    /* PRIZE JSON */

    let prizes = {};

    if ($("tPrizes").value.trim()) {
      try {
        prizes = JSON.parse(
          $("tPrizes").value.trim()
        );
      } catch {
        throw new Error(
          "Prize JSON is invalid."
        );
      }
    }


    /* TOTAL PRIZE */

    let prizeTotal = 0;

    if (
      prizes &&
      typeof prizes === "object" &&
      !Array.isArray(prizes)
    ) {
      prizeTotal = Object.values(prizes)
        .reduce(
          (total, value) =>
            total + Number(value || 0),
          0
        );
    }


    /* FIRESTORE DOCUMENT */

    const tournamentData = {

      name,

      imageUrl,

      mode,

      isFree,

      entryFee: isFree ? 0 : entryFee,

      totalSlots,

      joinedCount: 0,

      /* ⭐ PER KILL */
      perKill,

      registrationEnd,

      matchDateTime,

      prizes,

      prizeTotal,

      createdAt: serverTimestamp(),

      createdBy: auth.currentUser.uid

    };


    const tournamentRef = await addDoc(
      collection(db, "tournaments"),
      tournamentData
    );


    toast(
      "Tournament created: " +
      tournamentRef.id
    );

    $("tournamentForm").reset();

    $("tFree").value = "false";
    $("tFee").disabled = false;

  } catch (error) {

    console.error(
      "Create tournament error:",
      error
    );

    toast(error.message);
  }
}


/* =========================
   ROOM UPDATE
========================= */

async function roomUpdate(e) {
  e.preventDefault();

  try {

    const tournamentId =
      $("roomTournamentId").value.trim();

    const roomId =
      $("roomId").value.trim();

    const roomPassword =
      $("roomPassword").value.trim();


    if (!tournamentId) {
      throw new Error(
        "Tournament ID is required."
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
        roomPassword,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid
      }
    );

    toast(
      "Room credentials updated."
    );

    e.target.reset();

  } catch (error) {
    toast(error.message);
  }
}


/* =========================
   TOURNAMENT LIST
========================= */

function loadTournaments() {

  const q = query(
    collection(db, "tournaments"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(
    q,
    snapshot => {

      $("adminTournaments").innerHTML =
        snapshot.docs.map(d => {

          const x = d.data();

          return `
            <div class="listrow">

              <b>${esc(x.name)}</b>

              · ${esc(x.mode)}

              · Entry ₹${Number(
                x.entryFee || 0
              )}

              · Per Kill ₹${Number(
                x.perKill || 0
              )}

              · Slots ${Number(
                x.joinedCount || 0
              )}/${Number(
                x.totalSlots || 0
              )}

              <br>

              <small>${d.id}</small>

              <button
                class="btn danger"
                data-del="${d.id}">
                Delete
              </button>

            </div>
          `;

        }).join("") ||
        "No tournaments.";


      document
        .querySelectorAll("[data-del]")
        .forEach(button => {

          button.onclick = async () => {

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
                  button.dataset.del
                )
              );

              toast(
                "Tournament deleted."
              );

            } catch (error) {
              toast(error.message);
            }

          };

        });

    },
    error => {
      console.error(
        "Tournament listener:",
        error
      );

      toast(error.message);
    }
  );
}


/* =========================
   PLAYERS
========================= */

function loadPlayers() {

  const q = query(
    collection(db, "tournamentParticipants"),
    orderBy("joinedAt", "desc")
  );

  onSnapshot(
    q,
    snapshot => {

      $("players").innerHTML =
        snapshot.docs.map(d => {

          const x = d.data();

          return `
            <div class="listrow">

              <b>${esc(
                x.tournamentName
              )}</b>

              <br>

              ${esc(
                x.characterName
              )}

              · BGMI ${esc(
                x.bgmiId
              )}

              · WhatsApp ${esc(
                x.whatsapp
              )}

              · UPI ${esc(
                x.upiId
              )}

              · ₹${Number(
                x.entryFee || 0
              )}

            </div>
          `;

        }).join("") ||
        "No players.";

    },
    error => {
      console.error(
        "Players listener:",
        error
      );
    }
  );
}


/* =========================
   ESCAPE HTML
========================= */

function esc(value) {

  return String(value ?? "")
    .replace(
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
