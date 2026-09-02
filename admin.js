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


/* =========================
   FIREBASE
========================= */

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
  const el = $("toast");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = String(message || "");
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2500);
}


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


/* =========================
   ADMIN CHECK
========================= */

async function isAdmin(uid) {
  if (!uid) return false;

  const snap = await getDoc(
    doc(db, "users", uid)
  );

  return (
    snap.exists() &&
    snap.data()?.role === "admin"
  );
}


/* =========================
   AUTH
========================= */

onAuthStateChanged(auth, async user => {

  try {

    if (!user) {

      if ($("dashboard")) {
        $("dashboard").hidden = true;
      }

      if ($("adminLoginCard")) {
        $("adminLoginCard").hidden = false;
      }

      return;
    }


    const admin = await isAdmin(user.uid);


    if (!admin) {

      toast("Not authorized as admin.");

      await signOut(auth);

      return;
    }


    if ($("adminLoginCard")) {
      $("adminLoginCard").hidden = true;
    }

    if ($("dashboard")) {
      $("dashboard").hidden = false;
    }


    await load();


  } catch (error) {

    console.error(
      "Admin authentication error:",
      error
    );

    toast(
      error?.message ||
      "Unable to verify admin account."
    );

  }

});


/* =========================
   LOGIN
========================= */

if ($("adminLoginForm")) {

  $("adminLoginForm").onsubmit = async e => {

    e.preventDefault();

    try {

      await signInWithEmailAndPassword(
        auth,
        $("adminEmail").value.trim(),
        $("adminPassword").value
      );

    } catch (error) {

      console.error(
        "Admin login error:",
        error
      );

      toast(
        error?.message ||
        "Login failed."
      );

    }

  };

}


/* =========================
   LOGOUT
========================= */

if ($("adminLogout")) {

  $("adminLogout").onclick = async () => {

    try {

      await signOut(auth);

    } catch (error) {

      console.error(error);
      toast(error.message);

    }

  };

}


/* =========================
   LOAD ADMIN DATA
========================= */

async function load() {


  /* =========================
     LOAD SETTINGS
  ========================= */

  try {

    const settingsRef =
      doc(
        db,
        "adminSettings",
        "public"
      );

    const settingsSnap =
      await getDoc(settingsRef);

    const data =
      settingsSnap.exists()
        ? settingsSnap.data()
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

    /*
      Settings read fail hone par
      dashboard ko blank nahi karna.
    */

    toast(
      "Unable to load settings: " +
      (error?.message || "Unknown error")
    );

  }


  /* =========================
     SAVE SETTINGS
  ========================= */

  if ($("settingsForm")) {

    $("settingsForm").onsubmit =
      async e => {

        e.preventDefault();

        try {

          if (!auth.currentUser) {
            throw new Error(
              "Admin session expired. Please login again."
            );
          }


          const logo =
            $("logoUrl")?.value.trim() || "";

          const splash =
            $("splashUrl")?.value.trim() || "";

          const qr =
            $("qrUrl")?.value.trim() || "";


          /* URL VALIDATION */

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
                `${label} must be a valid HTTPS URL.`
              );

            }

          }


          /* VERIFY ADMIN */

          const adminUid =
            auth.currentUser.uid;

          const adminSnap =
            await getDoc(
              doc(
                db,
                "users",
                adminUid
              )
            );


          if (
            !adminSnap.exists() ||
            adminSnap.data()?.role !== "admin"
          ) {

            throw new Error(
              "Admin verification failed."
            );

          }


          /* SAVE */

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
              updatedBy:
                adminUid
            },
            {
              merge: true
            }
          );


          toast(
            "Settings saved successfully."
          );


        } catch (error) {

          console.error(
            "Settings save error:",
            error
          );

          toast(
            "Save failed: " +
            (error?.message ||
              "Unknown error")
          );

        }

      };

  }


  /* =========================
     FREE / PAID
  ========================= */

  if ($("tFree")) {

    $("tFree").onchange = () => {

      const free =
        $("tFree").value === "true";


      if ($("tFee")) {

        $("tFee").disabled = free;

        if (free) {
          $("tFee").value = 0;
        }

      }

    };

  }


  /* =========================
     TOURNAMENT
  ========================= */

  if ($("tournamentForm")) {

    $("tournamentForm").onsubmit =
      createTournament;

  }


  /* =========================
     ROOM
  ========================= */

  if ($("roomForm")) {

    $("roomForm").onsubmit =
      roomUpdate;

  }


  /* =========================
     LOAD DATA
  ========================= */

  loadTournaments();
  loadPlayers();

}


/* =========================
   CREATE TOURNAMENT
========================= */

async function createTournament(e) {

  e.preventDefault();

  try {

    const name =
      $("tName").value.trim();

    const imageUrl =
      $("tImage").value.trim();

    const mode =
      $("tMode").value;

    const isFree =
      $("tFree").value === "true";


    const entryFee =
      Number(
        $("tFee").value || 0
      );


    const totalSlots =
      Number(
        $("tSlots").value || 0
      );


    const perKill =
      Number(
        $("tKill").value || 0
      );


    const registrationEnd =
      $("tReg").value;

    const matchDateTime =
      $("tDate").value;


    /* VALIDATION */

    if (!name) {

      throw new Error(
        "Tournament name is required."
      );

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


    /* =========================
       PRIZES
    ========================= */

    const prizes = {};


    const prize1 =
      Number(
        $("prize1").value || 0
      );

    if (prize1 > 0) {
      prizes["1st"] = prize1;
    }


    const prize2 =
      Number(
        $("prize2").value || 0
      );

    if (prize2 > 0) {
      prizes["2nd"] = prize2;
    }


    const prize3 =
      Number(
        $("prize3").value || 0
      );

    if (prize3 > 0) {
      prizes["3rd"] = prize3;
    }


    /* EXTRA PRIZES */

    for (let i = 1; i <= 5; i++) {

      const rangeInput =
        $(`prizeRange${i}`);

      const amountInput =
        $(`prizeAmount${i}`);


      if (
        !rangeInput ||
        !amountInput
      ) {
        continue;
      }


      const range =
        rangeInput.value.trim();

      const amount =
        Number(
          amountInput.value || 0
        );


      if (
        range &&
        amount > 0
      ) {

        prizes[range] = amount;

      }

    }


    /* TOTAL PRIZE */

    let prizeTotal = 0;

    Object.values(prizes)
      .forEach(value => {

        prizeTotal +=
          Number(value || 0);

      });


    /* =========================
       FIRESTORE DATA
    ========================= */

    const tournamentData = {

      name,

      imageUrl,

      mode,

      isFree,

      entryFee:
        isFree ? 0 : entryFee,

      totalSlots,

      joinedCount: 0,

      perKill,

      registrationEnd,

      matchDateTime,

      prizes,

      prizeTotal,

      createdAt:
        serverTimestamp(),

      createdBy:
        auth.currentUser.uid

    };


    /* SAVE */

    const tournamentRef =
      await addDoc(
        collection(
          db,
          "tournaments"
        ),
        tournamentData
      );


    toast(
      "Tournament created successfully."
    );


    console.log(
      "Tournament ID:",
      tournamentRef.id
    );


    /* RESET */

    $("tournamentForm").reset();

    $("tFree").value = "false";

    $("tFee").disabled = false;


    $("prize1").value = 0;
    $("prize2").value = 0;
    $("prize3").value = 0;


    for (let i = 1; i <= 5; i++) {

      if ($(`prizeRange${i}`)) {
        $(`prizeRange${i}`).value = "";
      }

      if ($(`prizeAmount${i}`)) {
        $(`prizeAmount${i}`).value = 0;
      }

    }


  } catch (error) {

    console.error(
      "Create tournament error:",
      error
    );

    toast(
      error?.message ||
      "Unable to create tournament."
    );

  }

}


/* =========================
   ROOM UPDATE
========================= */

async function roomUpdate(e) {

  e.preventDefault();

  try {

    const tournamentId =
      $("roomTournamentId")
        .value
        .trim();

    const roomId =
      $("roomId")
        .value
        .trim();

    const roomPassword =
      $("roomPassword")
        .value
        .trim();


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

        updatedAt:
          serverTimestamp(),

        updatedBy:
          auth.currentUser.uid
      },
      {
        merge: true
      }
    );


    toast(
      "Room credentials updated."
    );


    e.target.reset();


  } catch (error) {

    console.error(
      "Room update error:",
      error
    );

    toast(
      error?.message ||
      "Unable to update room credentials."
    );

  }

}


/* =========================
   TOURNAMENT LIST
========================= */

function loadTournaments() {

  try {

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


    onSnapshot(
      q,

      snapshot => {

        if (!$("adminTournaments")) {
          return;
        }


        $("adminTournaments").innerHTML =

          snapshot.docs
            .map(d => {

              const x =
                d.data();


              return `
                <div class="listrow">

                  <b>${esc(x.name)}</b>

                  · ${esc(x.mode || "")}

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

                  <small>
                    ${esc(d.id)}
                  </small>

                  <button
                    class="btn danger"
                    data-del="${esc(d.id)}">
                    Delete
                  </button>

                </div>
              `;

            })
            .join("")

          ||

          "No tournaments.";


        document
          .querySelectorAll(
            "[data-del]"
          )
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

                  console.error(
                    "Delete tournament error:",
                    error
                  );

                  toast(
                    error?.message ||
                    "Unable to delete tournament."
                  );

                }

              };

          });

      },


      error => {

        console.error(
          "Tournament listener error:",
          error
        );

        if ($("adminTournaments")) {

          $("adminTournaments").innerHTML =
            `<p class="muted">
              Unable to load tournaments.
            </p>`;

        }

      }

    );

  } catch (error) {

    console.error(
      "Tournament query error:",
      error
    );

  }

}


/* =========================
   PLAYERS
========================= */

function loadPlayers() {

  try {

    const q =
      query(
        collection(
          db,
          "tournamentParticipants"
        ),
        orderBy(
          "joinedAt",
          "desc"
        )
      );


    onSnapshot(
      q,

      snapshot => {

        if (!$("players")) {
          return;
        }


        $("players").innerHTML =

          snapshot.docs
            .map(d => {

              const x =
                d.data();


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

            })
            .join("")

          ||

          "No players.";

      },


      error => {

        console.error(
          "Players listener error:",
          error
        );

        if ($("players")) {

          $("players").innerHTML =
            `<p class="muted">
              Unable to load players.
            </p>`;

        }

      }

    );

  } catch (error) {

    console.error(
      "Players query error:",
      error
    );

  }

}
