
<!-- FILE: README.md -->

# Innopoll — Setup Guide

## A. Configure Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Paste and run `SETUP_SQL.sql`.
4. Open Project Settings → API.
5. Copy your Project URL and publishable key into `config.js`.
6. Open Authentication settings and disable public sign-ups.
7. Under Authentication → Users, create an account for each authorised facilitator.
8. Confirm that the `responses` table is enabled for Realtime in your project's publication settings.

Never place a service-role or secret key in browser JavaScript.

## B. Test locally

1. Open the project in VS Code.
2. Install the Live Server extension if you do not already have it.
3. Start Live Server from `participant/participant.html`.
4. Open `facilitator/facilitator.html` through the same local server.
5. Sign in using the facilitator account you created in Supabase.
6. Create a test session.
7. Open its QR link and submit a test response.
8. Confirm that the response count and charts update.

Do not test by opening the HTML files directly with a `file://` URL.
Use a local web server instead.

## C. Deploy the two sites separately

Participant site:
- participant.html
- participant.js
- styles.css
- config.js

Facilitator site:
- facilitator.html
- facilitator.js
- styles.css
- config.js

For each deployment, place the HTML, JavaScript, CSS and config files together
in that site's deployment root. If you do this, change the stylesheet and
script references in each HTML file from `../styles.css`, `../config.js`
and `../participant.js` / `../facilitator.js` to the matching local filenames,
such as `./styles.css`, `./config.js` and `./participant.js`.

Set PARTICIPANT_SITE_URL in the facilitator site's config.js to the full
deployed participant page URL, for example:

https://your-participant-site.vercel.app/participant.html

Deploy the participant site first, then add its real URL to the facilitator
site's config.js and redeploy the facilitator site.

## D. Scoring

Responses use a 1–5 scale:
- 1 = Strongly disagree
- 2 = Disagree
- 3 = Neither agree nor disagree
- 4 = Agree
- 5 = Strongly agree

The dashboard converts the average response to a percentage:
((average score - 1) / 4) × 100

This maps 1 to 0, 3 to 50, and 5 to 100.

## E. Exporting charts

Use each chart's Export chart button to save it as a PNG image.
Insert those images into PowerPoint.

The Export all charts as images button triggers downloads for all three charts.
Depending on your browser settings, you may need to allow multiple downloads.

## F. Before using with real participants

- Test session creation, QR links, submissions, closing and reopening sessions.
- Confirm that a facilitator cannot see another facilitator's results.
- Keep public sign-ups disabled.
- Never expose a service-role key in frontend code.
- Consider adding abuse prevention or a server-side submission endpoint before
  using public survey links at scale. Public insert permissions alone do not
  prevent automated or repeated submissions.
