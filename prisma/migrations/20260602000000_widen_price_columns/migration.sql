-- VND prices can exceed 99,999,999 (houses/land cost billions). Widen from DECIMAL(10,2) to DECIMAL(15,2).
ALTER TABLE "Product" ALTER COLUMN "price" TYPE DECIMAL(15,2);
ALTER TABLE "RealEstate" ALTER COLUMN "price" TYPE DECIMAL(15,2);
ALTER TABLE "RealEstatePriceHistory" ALTER COLUMN "price" TYPE DECIMAL(15,2);
