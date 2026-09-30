ALTER TABLE "Item" ADD COLUMN "orbitX" DOUBLE PRECISION,
ADD COLUMN "orbitY" DOUBLE PRECISION,
ADD COLUMN "orbitPlacedAt" TIMESTAMP(3);

ALTER TABLE "Item" ADD CONSTRAINT "Item_orbit_position_bounds" CHECK (
  ("orbitX" IS NULL AND "orbitY" IS NULL AND "orbitPlacedAt" IS NULL) OR
  ("orbitX" IS NOT NULL AND "orbitY" IS NOT NULL AND "orbitPlacedAt" IS NOT NULL
   AND abs("orbitX") BETWEEN 0.1 AND 0.88 AND abs("orbitY") BETWEEN 0.1 AND 0.88)
);
