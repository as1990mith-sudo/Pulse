// Idempotent migration: the Home Broadcast tables.
//
// Run with:
//   node --env-file=/vercel/share/.env.project scripts/add-home-broadcast.mjs
//
// Uses node-postgres (pg) like every other schema script in this project — NOT
// the Neon serverless driver. Safe to run repeatedly.

import pg from "pg"

const { Client } = pg

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!connectionString) {
  console.error("No DATABASE_URL / DATABASE_URL_UNPOOLED in the environment.")
  process.exit(1)
}

const client = new Client({ connectionString })

async function main() {
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS "home_broadcast" (
      "id" serial PRIMARY KEY,
      "homeId" text NOT NULL,
      "createdBy" text NOT NULL,
      "message" text NOT NULL,
      "attachmentUrl" text,
      "attachmentType" text,
      "attachmentName" text,
      "recipientType" text NOT NULL DEFAULT 'all',
      "recipientCount" integer NOT NULL DEFAULT 0,
      "status" text NOT NULL DEFAULT 'sent',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "sentAt" timestamp NOT NULL DEFAULT now()
    );
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS "home_broadcast_home_idx"
      ON "home_broadcast" ("homeId", "sentAt");
  `)

  await client.query(`
    CREATE TABLE IF NOT EXISTS "home_broadcast_recipient" (
      "id" serial PRIMARY KEY,
      "broadcastId" integer NOT NULL,
      "homeId" text NOT NULL,
      "userId" text NOT NULL,
      "sentAt" timestamp NOT NULL DEFAULT now(),
      "openedAt" timestamp,
      "status" text NOT NULL DEFAULT 'sent'
    );
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS "home_broadcast_recipient_broadcast_idx"
      ON "home_broadcast_recipient" ("broadcastId");
  `)
  await client.query(`
    CREATE INDEX IF NOT EXISTS "home_broadcast_recipient_user_home_idx"
      ON "home_broadcast_recipient" ("userId", "homeId");
  `)
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "home_broadcast_recipient_unique"
      ON "home_broadcast_recipient" ("broadcastId", "userId");
  `)

  console.log("home_broadcast + home_broadcast_recipient ready.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => client.end())
