# Deploying the rules (project plot-9fd6e, default database + default bucket)

Replaces whatever is deployed now. Cloud Functions (Admin SDK) are unaffected by rules.

## 1. Test first (recommended, ~2 minutes, needs Java)
    cd rules-tests && npm install && npm test
These tests were written against the files but have NOT been run by the author (no
emulator in the authoring sandbox). Any failure is either a test typo or a real rule
bug: fix before deploying. The two assumptions most worth watching:
  * `users` list queries by operators/landlords (`where cyberId == pId`, `where email == ...`)
  * collection-group reads of `tenants` / `invoices`

## 2. Deploy (from any machine, any folder containing these files)
    firebase deploy --only firestore:rules,storage --project plot-9fd6e
`--only firestore:rules` leaves indexes untouched.

## 3. Watch for 15 minutes after deploy
Console > Firestore > Rules > "Monitor rules" (denied reads/writes) and Storage > Rules.
Then exercise: PMS login + sync, tenant portal lookup, operator walk-in rent payment,
public /upload page (upload + search by pId + marketplace), agent signup (KYC uploads).

## 4. Rollback
Console > Firestore > Rules > "Rules history" > pick the previous version > Publish
(same for Storage). Or redeploy the previous file.

## Single-switch relaxations if something legitimate breaks
* users updates rejected  -> in firestore.rules make `entitlementsUntouched()` `return true;`
* operator walk-in payment rejected -> check the field list in the invoices/tenants update rules
* anonymous upload rejected -> compare the file's contentType with the list in storage.rules
Do not loosen anything else without reading the GAP / NEXT STEP comment next to it.
