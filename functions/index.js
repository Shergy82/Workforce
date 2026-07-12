const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * CSCS Card / Qualification Expiration Daily Auditor
 * Runs daily at midnight to scan all users for CSCS cards or qualification certificates
 * expiring in less than 30 days, and inserts a system notification.
 */
exports.auditCSCSCards = functions.pubsub
  .schedule("0 0 * * *")
  .timeZone("Europe/London")
  .onRun(async (context) => {
    const today = new Date();
    const alertThresholdMs = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

    try {
      const usersSnap = await db.collection("users").get();
      const batch = db.batch();

      usersSnap.forEach((doc) => {
        const userData = doc.data();
        if (userData.cscsExpiry) {
          const expiryDate = new Date(userData.cscsExpiry);
          const timeDiff = expiryDate.getTime() - today.getTime();

          // Check if expiring in less than 30 days and not already notified
          if (timeDiff > 0 && timeDiff <= alertThresholdMs) {
            const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            
            // Create a warning notification doc
            const notifRef = db.collection("notifications").doc();
            batch.set(notifRef, {
              userId: doc.id,
              title: "CSCS Card Expiring Soon",
              message: `Your CSCS card or ticket (${userData.qualifications || "License"}) is expiring in ${diffDays} days on ${userData.cscsExpiry}. Please upload your renewed card.`,
              type: "hr",
              read: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          } else if (timeDiff < 0) {
            // Already expired
            const notifRef = db.collection("notifications").doc();
            batch.set(notifRef, {
              userId: doc.id,
              title: "CSCS Card Expired",
              message: `Your CSCS card or qualification certificate has EXPIRED on ${userData.cscsExpiry}. Please update your profile immediately.`,
              type: "hr",
              read: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      });

      await batch.commit();
      console.log("CSCS qualification audits finished successfully.");
      return null;
    } catch (err) {
      console.error("CSCS audit execution failed:", err);
      return null;
    }
  });

/**
 * Triggered on Shift Assignment Changes
 * Sends a notification if a shift is created, modified or deleted
 */
exports.onShiftWrite = functions.firestore
  .document("shifts/{shiftId}")
  .onWrite(async (change, context) => {
    const shiftId = context.params.shiftId;
    const beforeData = change.before.exists ? change.before.data() : null;
    const afterData = change.after.exists ? change.after.data() : null;

    // 1. Shift Deleted
    if (beforeData && !afterData) {
      if (beforeData.userId) {
        await db.collection("notifications").add({
          userId: beforeData.userId,
          title: "Shift Deleted",
          message: `Your scheduled shift at ${beforeData.siteAddress || 'a site'} on ${beforeData.date} has been deleted.`,
          type: "shift",
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      return;
    }

    // 2. Shift Created
    if (!beforeData && afterData) {
      if (afterData.userId) {
        await db.collection("notifications").add({
          userId: afterData.userId,
          title: "New Shift Assigned",
          message: `You have been assigned to ${afterData.siteAddress || 'a site'} on ${afterData.date} (${afterData.startTime || 'TBC'}).`,
          type: "shift",
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      return;
    }

    // 3. Shift Updated
    if (beforeData && afterData) {
      // 3a. Status changed to cancelled
      if (beforeData.status !== 'cancelled' && afterData.status === 'cancelled') {
        if (afterData.userId) {
          await db.collection("notifications").add({
            userId: afterData.userId,
            title: "Shift Cancelled",
            message: `Your shift at ${afterData.siteAddress || 'a site'} on ${afterData.date} has been cancelled.`,
            type: "shift",
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        return;
      }

      // 3b. Status changed to completed
      if (beforeData.status !== 'completed' && afterData.status === 'completed') {
        if (afterData.userId) {
          await db.collection("notifications").add({
            userId: afterData.userId,
            title: "Job Completed",
            message: `Your job at ${afterData.siteAddress || 'a site'} has been completed and closed.`,
            type: "shift",
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        return;
      }

      // 3c. User changed (Assigned, Unassigned, or Swapped)
      const userChanged = beforeData.userId !== afterData.userId;
      if (userChanged) {
        // Notify old user they were unassigned
        if (beforeData.userId) {
          await db.collection("notifications").add({
            userId: beforeData.userId,
            title: "Shift Unassigned",
            message: `You have been removed from the shift at ${beforeData.siteAddress || 'a site'} on ${beforeData.date}.`,
            type: "shift",
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        // Notify new user they were assigned
        if (afterData.userId) {
          await db.collection("notifications").add({
            userId: afterData.userId,
            title: "New Shift Assigned",
            message: `You have been assigned to ${afterData.siteAddress || 'a site'} on ${afterData.date} (${afterData.startTime || 'TBC'}).`,
            type: "shift",
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        return;
      }

      // 3d. Core Details Changed (time, date, site, or task) - only if same user is assigned
      const timeChanged = beforeData.startTime !== afterData.startTime;
      const dateChanged = beforeData.date !== afterData.date;
      const siteChanged = beforeData.siteId !== afterData.siteId;
      const taskChanged = beforeData.task !== afterData.task;

      if ((timeChanged || dateChanged || siteChanged || taskChanged) && afterData.userId) {
        await db.collection("notifications").add({
          userId: afterData.userId,
          title: "Shift Details Updated",
          message: `Your schedule at ${afterData.siteAddress || 'a site'} was modified. New Slot: ${afterData.date} (${afterData.startTime || 'TBC'}).`,
          type: "shift",
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  });
