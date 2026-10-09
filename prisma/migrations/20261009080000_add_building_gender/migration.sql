CREATE TYPE "BuildingGender" AS ENUM ('MALE', 'FEMALE');

ALTER TABLE "buildings"
ADD COLUMN "gender" "BuildingGender" NOT NULL DEFAULT 'MALE';
