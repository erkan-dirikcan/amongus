-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('LOBBY', 'IN_PROGRESS', 'ENDED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('IMPOSTOR', 'CREW');

-- CreateEnum
CREATE TYPE "Team" AS ENUM ('CREW', 'IMPOSTOR');

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "hostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "winner" "Team",

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role",
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_userId_key" ON "MatchPlayer"("matchId", "userId");

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
