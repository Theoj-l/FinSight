import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
export async function activeBusinessUnits(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{dept_no: string}[]>(Prisma.sql`
    SELECT DISTINCT dept_no FROM (
      SELECT p.dept_no, p.period_no,
        CASE WHEN g.acc_type IN ('CS','EX') THEN 'cost' ELSE g.acc_type END AS metric,
        SUM(p.home_cr-p.home_dr) AS amount
      FROM pbalance p JOIN gl_mast g ON g.acc_no=p.acc_no
      WHERE g.acc_type IN ('RE','CS','EX','OI')
      GROUP BY p.dept_no,p.period_no,CASE WHEN g.acc_type IN ('CS','EX') THEN 'cost' ELSE g.acc_type END
    ) activity WHERE amount <> 0 ORDER BY dept_no`);
  return rows.map(r => r.dept_no);
}
