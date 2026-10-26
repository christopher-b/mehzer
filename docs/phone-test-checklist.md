# Phone test checklist

The automated tests (unit tests and the Playwright suite) run in Chromium and in WebKit (Safari's engine), on desktop-sized and emulated phone-sized screens. They cannot check the things that only a real phone does: the camera sheet, the on-screen keyboard, real touch dragging, the browser's own dialogs, and each browser's quirks. This list covers those. Run it on a real phone before relying on a release, and again after changes to photos, measuring or the menus.

Takes about 15 minutes. Use a **fresh project** so nothing old gets in the way.

## Before you start

- [ ] The app is reachable from the phone. The deployed address (`https://mehzur.cbennell.com`), or on your network: `http://<computer's address>:3000`.
- [ ] Note the phone, operating system version and browser in the results table at the end.
- [ ] Test both **light and dark mode** on the phone (the app should look the same in both: it is light-only). Do the main run in your usual setting, then repeat steps 4 and 6 in the other.
- [ ] Have a way to see a few real photos: take new ones, and pick one large photo from the library (12 megapixels or more is ideal).

## 1. Sign in and accounts

- [ ] The email and password fields open the keyboard (the email field shows the `@` keyboard); your password manager offers to fill both.
- [ ] A wrong password or an unknown email shows "Incorrect email or password" (the same message for both) and does not sign you in.
- [ ] The right email and password sign you in. **Close the browser completely and reopen it: you are still signed in.**
- [ ] Docker over plain `http` only: signing in works and stays signed in (if you land back on the sign-in page every time, the session cookie is being dropped; report it).
- [ ] **First start** (fresh server only): the first visit goes to **Set up Mehzur**; the setup password creates the administrator and signs you in.
- [ ] The **account menu** (your name in the header) shows your email, **Account**, **Users** (administrator only) and **Sign out**. Tap outside it: it closes. A long name is shortened with "…" and the project-menu button still fits beside the project name.
- [ ] **Invite** (administrator): Users > Create invite link. Send the link to yourself (or open it in a private tab): the Join page asks for a name and a password, signs you in, and shows no projects from the administrator. Opening the same link again says it is no longer valid.
- [ ] **Sharing** (two accounts): Project menu > Share, enter the other person's email: they appear in the list, and the project shows under **Shared with me** on their home page with "Shared by ...". As a guest they can add photos and rooms but the menu has no Share and Edit project has no Delete; **Leave project** works. **Hand over** swaps the roles; **Remove** takes the project away from them at once.
- [ ] **Forgot your password?** (needs email set up): the email arrives from mehzur@cbennell.com within a minute, the link opens the new-password page, and the old password stops working afterwards. Asking for an address that has no account shows the same "we have sent it a link" message and sends nothing.
- [ ] **Account > Email address** (needs email set up): enter a new address and your password; a link arrives at the new address, and your email does not change until you open it and tap the button. The old address gets a notice, other devices are signed out, and signing in works with the new address only.
- [ ] **Passkeys** (production, https): Account > Passkeys > name it, **Add a passkey**: the phone asks for fingerprint, face or PIN, and it appears in the list. Sign out, then **Sign in with a passkey** on the sign-in page: it offers the passkey, and you are in without typing anything. Remove the passkey: the password still signs you in.
- [ ] **Account > Change password** signs out your other devices; **Sign out everywhere else** does too.

## 2. Project, header and rooms

- [ ] Create a project with a **very long name** (for example "The Very Long Named Cottage By The Lake"). The header shows `Mehzur / <name…> ☰` with the name shortened by "…", the project-menu button still visible beside it, and **"Sign out" stays on one line** and fully on screen.
- [ ] Tap **+ Room**: a popover opens centred under the button, the name field is focused and the keyboard opens. The **name field and the Add room button are still visible above the keyboard** (scroll if you must, but they must be reachable).
- [ ] Add rooms "Kitchen" and "Bedroom". The popover closes and both cards appear.
- [ ] Open a room's **hamburger menu**: Rename and Delete room appear fully on screen. Tap outside the menu: it closes.
- [ ] Rename a room from the menu; the rename field and its Save button work with the keyboard open.
- [ ] Tap a room's title: it collapses to a one-line summary and expands again. Reload the page: the choice is remembered.

## 3. Photos: camera and upload

- [ ] In Kitchen, tap the dashed **+ tile**. The phone offers **Take Photo / camera** *and* the photo library (iPhone: Photo Library, Take Photo, Choose File; Android: camera and files). Note which options you see.
- [ ] Take a new photo. You land on that photo's page, in the Kitchen. **The photo is the right way up** (not rotated or mirrored), whichever way you held the phone.
- [ ] Choose the **large library photo**. It uploads in a reasonable time and looks sharp when zoomed on screen.
- [ ] Go back and add **three photos at once** from the library. You land on the first one; **Next ›** and **‹ Previous** step through them in the order you uploaded them, and the counter reads "1 of 3", "2 of 3", "3 of 3".
- [ ] Try to upload something that is not a photo (a PDF or a document, if the phone lets you pick one). You stay on the project page and the upload list under **Rooms** shows the file's name with "Failed: This file couldn't be read as an image." and no Retry button. **Dismiss** clears the list.
- [ ] On the project page, the round **✕** on a thumbnail is easy to see and tap; it asks before deleting. Cancel it.

## 4. Measuring (the most important part)

- [ ] On a photo, **tap two points**. The first shows a red ring; the second opens the **New measurement** dialog **at the top of the screen**, with the **number pad** (not the full keyboard) ready in the Measurement field.
- [ ] In an imperial project, type `12`, tap the **'** key under the field, type `6`, tap **"**. The field reads `12'6"` and the preview says `= 12' 6"`. The keyboard **stays open** while you tap those keys.
- [ ] Tap **ABC**: the full keyboard appears. Tap **123**: the number pad returns.
- [ ] "(optional)" sits on the same line as "Name". Type a name; Save works with the keyboard open (the Save button is reachable).
- [ ] The line and its label appear on the photo, and the label is **readable on a bright photo and on a dark one**. The measurement appears in the list below.
- [ ] Type nonsense (for example `abc`): "Not recognised" shows and Save refuses it.
- [ ] **Drag an end point.** Tap the line to select it (it turns blue with two round handles). Drag a handle with your finger. **The page must not scroll while you drag**, the end point follows your finger, and it is still there after you reload. Scrolling the page from outside the photo still works. Pinch-zooming the page still works.
- [ ] In a **metric** project: a bare `3.25` becomes `3.25 m`, and the keys under the field are **m, cm, mm**.
- [ ] Tap two points but change your mind: tap **Cancel** next to the hint above the photo; the half-placed point disappears and nothing is left behind.

## 5. Photo page controls

- [ ] The big **← Back to <project>** button is easy to tap and returns to the project.
- [ ] The **hamburger** at the right of "Room: …" opens a menu with **Change room** and **Delete photo**, fully on screen.
- [ ] **Change room** opens a dialog **at the top of the screen**; choose another room and Save. "Room:" updates, and **Previous / Next** now reflect the new room.
- [ ] **Delete photo** asks for confirmation, then returns to the project; the photo and its measurements are gone.
- [ ] With a measurement selected, tap the hamburger and **Change room**: the room dialog opens (not the measurement editor).
- [ ] Rotate the phone to **landscape** and back, on both the project page and a photo page. Nothing is cut off, nothing overlaps.

## 6. Room area (the "Calculate" button)

- [ ] Put two measurements, a length and a width, on one photo in a room.
- [ ] On the project page open that room's hamburger menu. A **Calculate area** section appears with two dropdowns, a **×**, and a **Calculate** button.
- [ ] **The word "Calculate" is clearly visible on its button.** (This was reported as invisible once and never reproduced. If you can see it, note the phone, browser and whether dark mode was on. If you cannot, take a screenshot and report it.)
- [ ] The dropdowns open your phone's own picker; choose the length and then the width. Choosing the same one twice shows an error inside the menu.
- [ ] A valid pair closes the menu and shows the area (for example `120.0 ft²`) large on the room card.
- [ ] Open the Rename / Delete menu on a room with fewer than two measurements: there is no area section.

## 7. Everything else

- [ ] **Delete** a room, a photo and a project: each asks first (the phone's own "OK / Cancel" box). Cancel keeps it, OK removes it.
- [ ] With dark mode **on**, every screen is still fully readable (white buttons with dark text, no white-on-white).
- [ ] The **browser's back button** behaves sensibly: from a photo it goes to the project, not to a blank or half-loaded page.
- [ ] On a slow connection (turn Wi-Fi off and use mobile data, or a slow area), uploading several photos shows a list under **Rooms** with a progress bar and "Uploading 40%" (and so on) for each file, and finishes without losing any.
- [ ] Leave the app open for a few minutes with the screen off, then wake the phone: it is still signed in and still works.

## 8. Errors and being offline

Use **airplane mode** (or switch Wi-Fi and mobile data off) to go offline, and switch it back on to reconnect. Messages must be plain English: no "Failed to fetch", no codes, no technical text.

- [ ] Go offline with the app open. A slim banner under the header says **"You're offline. Changes won't be saved until you reconnect."** Buttons are still tappable (they are not greyed out).
- [ ] **During a save:** on a photo, tap two points, type a value, switch to airplane mode, tap **Save**. The dialog **stays open with your value** and says "You're offline. Check your connection and try again." (it must not close or lose the value). Reconnect: the banner goes, **"Back online"** appears briefly, and **Save** now works.
- [ ] **Add room offline:** tap **+ Room**, type a name, go offline, tap **Add room**. The popover stays open with the name and shows the offline message. Reconnect and tap **Add room** again: the room appears.
- [ ] **A dragged end point offline:** select a measurement, go offline, drag a handle. The point jumps back and a message at the bottom says "Couldn't save the new position." with a **Retry** button. Reconnect and tap **Retry**: "Saved" appears and the point stays where you dragged it. The message sits **above the iPhone home bar**, not hidden behind it.
- [ ] **During an upload:** start uploading several photos, then switch to airplane mode. Each file that did not finish shows "Failed: You're offline…" with a **Retry** button. Reconnect and tap **Retry** on each: they upload. If every file succeeds you land on the first photo.
- [ ] **Leave the app overnight** (or until the session would have expired, or sign out in another tab), then open it and try to save a measurement. A **"Signed out"** box appears with **Sign in** and **Cancel**. Your typed value is still in the measurement dialog behind it. Tap **Sign in**, sign in, and you land **back on the same photo** with the measurement dialog reopened and the value filled in. Save it.
- [ ] The same after expiry for **+ Room**: the sign-in brings you back to the project page with the popover reopened and the name filled in.
- [ ] The same for an **upload** after expiry: the files show "Not uploaded" with **Retry**, and the "Signed out" box opens. After signing in again, choose the photos again.
- [ ] Open an address that does not exist (for example add `/nothing` to the end of the site address): you see **"Page not found"** with a **Back to projects** link, and the header still shows.
- [ ] Error messages at the bottom of the screen are readable, can be closed with **Dismiss**, and fit on a narrow screen without sideways scrolling.

## If something fails

Write down, for each failure: **which step**, **what you expected**, **what happened**, the **phone model, OS version and browser**, whether **dark mode** was on, and a **screenshot** (or a short screen recording for drag and keyboard problems). Then add it to the results table and tell whoever is maintaining the app.

## Results

| Date | Phone / OS | Browser | App address | Passed | Failed steps and notes |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |

## 9. Add to home screen

- [ ] **iPhone (Safari):** Share > **Add to Home Screen**. The icon is a blue square with a white room outline and the name is "Mehzur". Opening it shows the app full-screen with no address bar, and you are still signed in.
- [ ] **Android (Chrome):** menu > **Install app** (or Add to Home screen). Same checks. The icon should not be cropped oddly.
- [ ] Signing out and back in inside the home-screen app works, and photo upload and camera still work from it.

## 10. Export

- [ ] On a project with rooms and measurements, open the **Project menu** and tap **Export PDF**: the file downloads or opens, and shows each room with its area, each photo with its yellow measurement lines and labels drawn on, and the measurements listed under it.
- [ ] From the **Project menu**, tap **Export CSV**: it downloads and opens in a spreadsheet app with the columns Room, Room area, Photo, Measurement, Value, Value (mm).

