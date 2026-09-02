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
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  firebaseConfig
} from "./firebase-config.js";


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);


/* =========================
   HELPERS
========================= */

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:";
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


/* =========================
   ADMIN CHECK
========================= */

async function isAdmin(uid) {

  const snapshot = await getDoc(
    doc(db, "users", uid)
  );

  return (
    snapshot.exists() &&
    snapshot.data().role === "admin"
  );
}


/* =========================
   AUTH STATE
========================= */

onAuthStateChanged(auth, async user => {

  if (!user) {

    $("dashboard").hidden = true;
    $("adminLoginCard").hidden = false;

    return;
  }


  if (!(await isAdmin(user.uid))) {

    toast("Not authorized as admin.");

    await signOut(auth);

    return;
  }


  $("adminLoginCard").hidden = true;
  $("dashboard").hidden = false;

  load();
});


/* =========================
   LOGIN
========================= */

$("adminLoginForm").onsubmit = async event => {

  event.preventDefault();

  try {

    await signInWithEmailAndPassword(
      auth,
      $("adminEmail").value,
      $("adminPassword").value
    );

  } catch (error) {

    toast(error.message);
  }
};


/* =========================
   LOGOUT
========================= */

$("adminLogout").onclick = () => {
  signOut(auth);
};


/* =========================
   LOAD ADMIN
========================= */

async function load() {

  /* SETTINGS */

  const settings = await getDoc(
    doc(db, "adminSettings", "public")
  );

  const data = settings.data() || {};

  $("logoUrl").value = data.logoUrl || "";
  $("splashUrl").value = data.splashUrl || "";
  $("qrUrl").value = data.qrUrl || "";


  /* SAVE SETTINGS */

  $("settingsForm").onsubmit = async event => {

    event.preventDefault();

    try {

      const logo = $("logoUrl").value.trim();
      const splash = $("splashUrl").value.trim();
      const qr = $("qrUrl").value.trim();


      for (
        const [label, url]
        of [
          ["Logo", logo],
          ["Splash", splash],
          ["Payment QR", qr]
        ]
      ) {

        if (
          url &&
          !isHttpUrl(url)
        ) {
          throw new Error(
            `${label} must be a valid https URL.`
          );
        }
      }


      await setDoc(
        doc(db, "adminSettings", "public"),
        {
          logoUrl: logo,
          splashUrl: splash,
          qrUrl: qr,
          updatedAt: new Date(),
          updatedBy: auth.currentUser.uid
        }
      );


      toast("Settings saved.");

    } catch (error) {

      toast(error.message);
    }
  };


  /* =========================
     FREE / PAID
  ========================= */

  $("tFree").onchange = () => {

    const isFree =
      $("tFree").value === "true";


    $("tFee").disabled = isFree;


    if (isFree) {
      $("tFee").value = 0;
    }
  };


  /* =========================
     FORMS
  ========================= */

  $("tournamentForm").onsubmit =
    createTournament;

  $("roomForm").onsubmit =
    roomUpdate;


  /* =========================
     LOAD DATA
  ========================= */

  loadDeposits();
  loadTournaments();
  loadPlayers();
}


/* =========================
   API
========================= */

async function api(path, body) {

  const token =
    await auth.currentUser.getIdToken();


  const response = await fetch(
    path,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization":
          "Bearer " + token
      },

      body: JSON.stringify(body)
    }
  );


  const result =
    await response.json();


  if (!result.success) {
    throw new Error(result.message);
  }


  return result;
}


/* =========================
   CREATE TOURNAMENT
========================= */

async function createTournament(event) {

  event.preventDefault();


  try {

    /* IMAGE URL */

    const imageUrl =
      $("tImage").value.trim();


    if (!isHttpUrl(imageUrl)) {

      throw new Error(
        "Tournament image must be a valid https URL."
      );
    }


    /* ENTRY FEE */

    const entryFee =
      Number($("tFee").value || 0);


    if (entryFee < 0) {

      throw new Error(
        "Entry Fee cannot be negative."
      );
    }


    /* PER KILL */

    const perKill =
      Number($("tKill").value || 0);


    if (perKill < 0) {

      throw new Error(
        "Per Kill cannot be negative."
      );
    }


    /* SLOTS */

    const totalSlots =
      Number($("tSlots").value);


    if (
      !Number.isInteger(totalSlots) ||
      totalSlots < 1
    ) {

      throw new Error(
        "Total slots must be at least 1."
      );
    }


    /* PRIZES */

    let prizes = {};


    if ($("tPrizes").value.trim()) {

      prizes =
        JSON.parse(
          $("tPrizes").value
        );
    }


    /* CREATE */

    const result =
      await api(
        "/api/createTournament",
        {

          name:
            $("tName").value.trim(),

          imageUrl,

          mode:
            $("tMode").value,

          isFree:
            $("tFree").value === "true",

          /* SEPARATE ENTRY FEE */
          entryFee,

          /* SEPARATE PER KILL */
          perKill,

          totalSlots,

          registrationEnd:
            $("tReg").value,

          matchDateTime:
            $("tDate").value,

          prizes
        }
      );


    toast(
      "Created: " +
      result.tournamentId
    );


    event.target.reset();


    /* RESET DEFAULT VALUES */

    $("tFee").value = 0;
    $("tKill").value = 0;
    $("tFee").disabled = false;


  } catch (error) {

    toast(error.message);
  }
}


/* =========================
   ROOM UPDATE
========================= */

async function roomUpdate(event) {

  event.preventDefault();


  try {

    await api(
      "/api/updateRoomCredentials",
      {

        tournamentId:
          $("roomTournamentId").value,

        roomId:
          $("roomId").value,

        roomPassword:
          $("roomPassword").value
      }
    );


    toast(
      "Room credentials updated."
    );

  } catch (error) {

    toast(error.message);
  }
}


/* =========================
   DEPOSITS
========================= */

function loadDeposits() {

  onSnapshot(

    query(
      collection(
        db,
        "depositRequests"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    ),

    snapshot => {

      $("deposits").innerHTML =
        snapshot.docs
          .map(docSnap => {

            const data =
              docSnap.data();


            return `
              <div class="listrow">

                <b>
                  ${esc(data.amount)}
                  ·
                  ${esc(data.utr)}
                </b>

                —
                ${esc(data.status)}

                <br>

                ${esc(data.email)}
                ·
                ${esc(data.mobile)}

                ${
                  data.status === "pending"
                  ? `
                    <button
                      class="btn primary"
                      data-approve="${docSnap.id}"
                    >
                      Approve
                    </button>

                    <button
                      class="btn danger"
                      data-reject="${docSnap.id}"
                    >
                      Reject
                    </button>
                  `
                  : ""
                }

              </div>
            `;

          })
          .join("")
        || "No requests.";


      document
        .querySelectorAll("[data-approve]")
        .forEach(button => {

          button.onclick =
            async () => {

              try {

                await api(
                  "/api/approveDeposit",
                  {
                    depositId:
                      button.dataset.approve
                  }
                );

                toast("Approved");

              } catch (error) {

                toast(error.message);
              }
            };
        });


      document
        .querySelectorAll("[data-reject]")
        .forEach(button => {

          button.onclick =
            async () => {

              try {

                await api(
                  "/api/rejectDeposit",
                  {
                    depositId:
                      button.dataset.reject
                  }
                );

                toast("Rejected");

              } catch (error) {

                toast(error.message);
              }
            };
        });
    }
  );
}


/* =========================
   TOURNAMENT LIST
========================= */

function loadTournaments() {

  onSnapshot(

    query(
      collection(
        db,
        "tournaments"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    ),

    snapshot => {

      $("adminTournaments").innerHTML =
        snapshot.docs
          .map(docSnap => {

            const data =
              docSnap.data();


            return `
              <div class="listrow">

                <b>
                  ${esc(data.name)}
                </b>

                · ${esc(data.mode)}

                · Entry ₹${Number(
                  data.entryFee || 0
                )}

                · Per Kill ₹${Number(
                  data.perKill || 0
                )}

                · slots
                ${Number(
                  data.joinedCount || 0
                )}
                /
                ${Number(
                  data.totalSlots || 0
                )}

                <br>

                <small>
                  ${docSnap.id}
                </small>

                <button
                  class="btn danger"
                  data-del="${docSnap.id}"
                >
                  Delete
                </button>

              </div>
            `;

          })
          .join("")
        || "No tournaments.";


      document
        .querySelectorAll("[data-del]")
        .forEach(button => {

          button.onclick =
            async () => {

              if (
                !confirm(
                  "Delete this tournament?"
                )
              ) {
                return;
              }


              try {

                await api(
                  "/api/deleteTournament",
                  {
                    tournamentId:
                      button.dataset.del
                  }
                );

                toast("Deleted");

              } catch (error) {

                toast(error.message);
              }
            };
        });
    }
  );
}


/* =========================
   PLAYERS
========================= */

function loadPlayers() {

  onSnapshot(

    query(
      collection(
        db,
        "tournamentParticipants"
      ),
      orderBy(
        "joinedAt",
        "desc"
      )
    ),

    snapshot => {

      $("players").innerHTML =
        snapshot.docs
          .map(docSnap => {

            const data =
              docSnap.data();


            return `
              <div class="listrow">

                <b>
                  ${esc(
                    data.tournamentName
                  )}
                </b>

                <br>

                ${esc(
                  data.characterName
                )}

                · BGMI
                ${esc(data.bgmiId)}

                · WhatsApp
                ${esc(data.whatsapp)}

                · UPI
                ${esc(data.upiId)}

                · ₹${Number(
                  data.entryFee || 0
                )}

              </div>
            `;

          })
          .join("")
        || "No players.";
    }
  );
}


/* =========================
   ESCAPE HTML
========================= */

function esc(value) {

  return String(
    value ?? ""
  ).replace(
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
