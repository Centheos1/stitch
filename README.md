# STITCH

Online shop for handmade felt, embroidered, knitted, and Christmas craft items.

- **Site:** https://stitchhandmade.shop
- **Stack:** React + Vite (client), Express (API), DynamoDB (data), S3 + CloudFront (site and product images), ECS Express Mode (API hosting), AWS CDK (infrastructure in `infra/`)

## Repository layout

| Path | What it is |
|---|---|
| `client/` | React storefront and admin page |
| `server/` | Express API, DynamoDB storage, image upload |
| `shared/` | Zod schemas and API route definitions used by both sides |
| `script/` | Build script, DynamoDB smoke test, Postgres import |
| `infra/` | CDK app: certificate, API, CloudFront, GitHub deploy role |
| `Dockerfile` | Container image for the API (listens on port 3000) |
| `.github/workflows/deploy.yml` | Deploys to AWS on every push to `main` |

## Requirements

- **Node.js 24.** The version is pinned in `.node-version`. AWS SDK updates released from January 2027 need Node 22 or later, so older versions will stop getting them.
- **AWS CLI v2** and an AWS profile named `stitch` (see [AWS access](#aws-access)).
- **Docker**, for building the API image during deploys.

## AWS access

The AWS profile lives in `.aws/` in this repo. The folder is gitignored and holds the access key for the `stitch-dev` user. The workspace points the AWS CLI and the terminal at it through `.vscode/settings.json`.

Check that it works:

```bash
aws sts get-caller-identity
```

It should show the `stitch-dev` user in account `437329951890`.

Never commit `.aws/`, and never put keys in `.env` files that get committed.

## Local development

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env` for local settings. npm loads `.env` for both `npm run dev` and the Postgres migration. The local server listens on [http://localhost:3000](http://localhost:3000); change `PORT` in `.env` to use another port.

**Warning:** local development reads and writes the live DynamoDB table `stitch`. It's the same table the shop uses. Creating, editing, or deleting products locally changes the live shop. Product photos under `/images/...` are proxied from the live CDN, so they appear locally too. Admin sign-in uses the same Secrets Manager password as the live site.

This checkout can use project-local Node.js and PostgreSQL binaries under `.local-tools/`, with Postgres data under `.local-data/`. If that existing local database contains the old shop data, run `./script/dev-local.sh` to start it and the app. The script does not run schema push against the migration source.

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Builds the React app to `dist/public` and the server to `dist/index.cjs` |
| `npm start` | Runs the production build (`NODE_ENV=production node dist/index.cjs`) |
| `npm run check` | TypeScript check for the app |
| `npx tsx script/dynamo-smoke.ts` | Creates, edits, orders, and deletes a test product in the live table. Run it only against a test table. |

## Environment variables

| Variable | Used by | Default |
|---|---|---|
| `PORT` | server | `3000` |
| `TABLE_NAME` | server | required (`stitch`) |
| `AWS_REGION` | server | `ap-southeast-2` in ECS |
| `IMAGES_BUCKET` | server | `stitch-images-437329951890` |
| `IMAGES_BUCKET_REGION` | server | `us-east-1` |
| `ADMIN_PASSWORD_SECRET_ID` | admin login | `stitch/admin-password` |
| `SESSION_SECRET_ID` | admin session cookie | `stitch/session-secret` |
| `DATABASE_URL` | Postgres import only | none |
| `UPLOADS_DIR` | Postgres import only | `./server/uploads` |

## Infrastructure

The CDK app is in `infra/`. Run commands from that folder:

```bash
cd infra
npm ci
npx cdk list
npx cdk diff StitchApiStack
npx cdk deploy StitchApiStack
```

Stacks:

| Stack | Region | Contents |
|---|---|---|
| `StitchCertificateStack` | us-east-1 | TLS certificate for `stitchhandmade.shop` and `www` |
| `StitchApiStack` | ap-southeast-2 | DynamoDB table `stitch`, ECS Express API, task and execution roles, API image |
| `StitchEdgeStack` | us-east-1 | CloudFront distribution, site bucket, product image bucket, DNS records, site upload |
| `StitchGithubOidcStack` | ap-southeast-2 | Role that GitHub Actions assumes for deploys |

CloudFront routes:

- `/api/*` goes to the ECS API.
- `/images/*` goes to the product image bucket.
- Everything else goes to the site bucket. Paths without a file extension serve `index.html`.

### One-time setup

These steps are already done for this account. Repeat them only for a new account or region.

```bash
cd infra
npx cdk bootstrap aws://437329951890/ap-southeast-2
npx cdk bootstrap aws://437329951890/us-east-1
```

Use the default qualifier. Both regions must use the same qualifier, or the stacks won't deploy.

`StitchGithubOidcStack` must be deployed once by hand before the first GitHub deploy, because the workflow assumes the role it creates.

## Deploying

Pushing to `main` deploys everything. The workflow in `.github/workflows/deploy.yml`:

1. Installs dependencies and runs `npm run build`.
2. Assumes the deploy role with GitHub OIDC. The role ARN comes from the repository variable `AWS_DEPLOY_ROLE_ARN`.
3. Runs `cdk deploy --all`. That builds the API image from the `Dockerfile`, rolls it out to ECS, uploads the site, and invalidates CloudFront.

To set up GitHub:

1. Deploy `StitchGithubOidcStack` and copy the `DeployRoleArn` output.
2. In the repo, go to **Settings → Secrets and variables → Actions → Variables** and add `AWS_DEPLOY_ROLE_ARN` with that value. It is `arn:aws:iam::437329951890:role/stitch-github-deploy`.

The role trusts `repo:Centheos1@23650906/stitch@1444934289:ref:refs/heads/main`. GitHub includes those permanent ids because this repository was created after 15 July 2026. A trust rule that only names `Centheos1/stitch` is rejected.

Watch the run in the **Actions** tab. Since there's no pull request requirement, every push to `main` goes live. Check the diff before you push.

To build the API image locally:

```bash
docker build --platform linux/amd64 -t stitch-api:local .
```

`CONTAINER_PORT` in `infra/lib/api-stack.ts` and `ENV PORT` in the `Dockerfile` must stay in sync.

## Images

Storefront images, including logos and the favicon, live in the same private S3 bucket as product photos. To replace a storefront image, upload it under `images/` with a new filename and update its `/images/<filename>` reference in the site. CloudFront serves these URLs in production, and the local development server proxies them to CloudFront.

Admin uploads use presigned S3 URLs:

1. The admin page calls `POST /api/upload-url` with the file type.
2. The browser uploads the resized file straight to the `stitch-images-437329951890` bucket.
3. The product stores a path such as `/images/<uuid>.jpg`, which CloudFront serves.

Product photos from the old server disk need migrating (see below). Photos already saved as external links (for example Unsplash) keep working.

## Migrating from Postgres

The old shop used Postgres and files in `server/uploads`. Run the import on the machine that has them:

```bash
npm ci
DATABASE_URL=postgres://user:pass@localhost:5432/stitch \
UPLOADS_DIR=./server/uploads \
npm run migrate:postgres -- --dry-run
```

`--dry-run` prints the source counts, image validation count, and any destination key collisions. Review them before running live.

The machine needs AWS credentials that can write to the `stitch` table and the images bucket.

Run `--dry-run` first. It reads the source database, validates local image files, and scans the destination table without writing to AWS. A live run without `--replace` stops if any destination keys already exist. `--replace` overwrites only keys represented by the source database; it does not clear the table. Keep the source database intact until you have checked the migrated products, orders, and images.

## Admin access

There is one admin. The password is the Secrets Manager secret `stitch/admin-password` in `ap-southeast-2`. The secret value is the password itself, not JSON. Surrounding whitespace is ignored.

The API reads it when someone signs in. A successful sign-in sets an `HttpOnly` cookie for 12 hours. Creating, editing, and deleting products, requesting an upload URL, and changing the password require that cookie. Public product pages and checkout do not.

While signed in, use Password on the admin page. Enter the current password and a new one of at least 12 characters. That browser stays signed in. Any other sign-in stops working on its next request.

Read the generated password:

```bash
aws secretsmanager get-secret-value \
  --secret-id stitch/admin-password \
  --region ap-southeast-2 \
  --query SecretString \
  --output text
```

The same secret can be replaced in the Secrets Manager console. Leave `stitch/session-secret` as it is. That one only signs the cookie. A console change signs everyone out on their next request.

Five wrong passwords from the same address within 15 minutes are rejected until the window passes.

## Orders and email

A customer request stores the chosen options and sends an HTML email from `orders@stitchhandmade.shop`. Replies to that email are filed on the order. The admin **Orders** tab shows the formatted message, its attachments, and sends questions, replies, and payment requests.

The **Inbox** tab is the shop mailbox for every other address at `stitchhandmade.shop`. New mail can be sent from `info@stitchhandmade.shop` or `audrey@stitchhandmade.shop`. Reply, reply all, and forward keep the conversation together. Archive hides a conversation. Delete removes the conversation, its formatted copy, and its attachments.

Messages are kept. Nothing expires on its own. The formatted mail and attachments are shown inside the admin page, and scripts in an email cannot run.

SES production access is already enabled in Sydney, so mail can go to customer addresses.

## Known gaps

- **Admin sign-in has no second factor.** The password in Secrets Manager is the only check.
- **Checkout records orders with a flat domestic shipping rate.** Set the per-order charge in **Admin Portal → Shipping settings**. The default is $5.00.
- **Contact page is display only.** It has no form.
- **The shop has no test data isolation.** Local dev and the deployed site share the same table.

See `todo.md` for content tasks.
