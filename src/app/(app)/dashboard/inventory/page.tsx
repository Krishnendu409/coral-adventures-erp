import { AlertTriangle, Boxes, PackageX, Truck } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatTile,
  EmptyState,
  Badge,
  Callout,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui";
import { formatInr } from "@/lib/utils";
import {
  getAllStockEstimates,
  getReorderAlerts,
  getShrinkageTotals,
  getVendorCostAnalysis,
} from "@/server/domain/analytics/inventory";
import { todayStr, trailingRange } from "@/server/domain/analytics/shared";

export const dynamic = "force-dynamic";

export default function InventoryIntelligencePage() {
  const asOf = todayStr();
  const range = trailingRange(180, asOf);

  const stockEstimates = getAllStockEstimates();
  const reorderAlerts = getReorderAlerts();
  const shrinkage = getShrinkageTotals(undefined, range);
  const vendorCosts = getVendorCostAnalysis(undefined, range);

  const totalShrinkageCost = shrinkage.reduce((sum, s) => sum + s.estimatedCostInr, 0);
  const totalVendorCost = vendorCosts.reduce((sum, v) => sum + v.totalCostInr, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Inventory Intelligence</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Stock is never stored — every balance below is summed live from restock, consumption, waste and shrinkage
          movements.
        </p>
      </div>

      {reorderAlerts.length > 0 && (
        <Callout tone="warning" title={`${reorderAlerts.length} item${reorderAlerts.length === 1 ? "" : "s"} below reorder threshold`}>
          {reorderAlerts.map((i) => i.name).join(", ")} — schedule a restock to avoid running out on an upcoming trip.
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active items tracked" value={String(stockEstimates.length)} icon={<Boxes size={16} />} />
        <StatTile
          label="Below reorder level"
          value={String(reorderAlerts.length)}
          icon={<AlertTriangle size={16} />}
        />
        <StatTile
          label="Shrinkage cost (180d)"
          value={formatInr(totalShrinkageCost)}
          icon={<PackageX size={16} />}
        />
        <StatTile
          label="Vendor restock cost (180d)"
          value={formatInr(totalVendorCost)}
          icon={<Truck size={16} />}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Current Stock Estimates</CardTitle>
            <CardDescription>Live balance = restocked − consumed − wasted − shrunk, all-time</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {stockEstimates.length === 0 ? (
            <EmptyState title="No inventory items" description="Stock estimates will appear once inventory items are configured." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Item</TableHeaderCell>
                  <TableHeaderCell className="text-right">Restocked</TableHeaderCell>
                  <TableHeaderCell className="text-right">Consumed</TableHeaderCell>
                  <TableHeaderCell className="text-right">Wasted</TableHeaderCell>
                  <TableHeaderCell className="text-right">Shrunk</TableHeaderCell>
                  <TableHeaderCell className="text-right">Estimated stock</TableHeaderCell>
                  <TableHeaderCell className="text-right">Reorder level</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...stockEstimates]
                  .sort((a, b) => Number(b.belowReorderLevel) - Number(a.belowReorderLevel) || a.name.localeCompare(b.name))
                  .map((item) => (
                    <TableRow key={item.itemId}>
                      <TableCell className="font-medium">
                        {item.name}
                        <div className="text-[12px] font-normal text-foreground-faint">{item.unit}</div>
                      </TableCell>
                      <TableCell className="text-right">{item.restocked.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{item.consumed.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{item.wasted.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{item.shrunk.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right font-medium">{item.estimatedStock.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right text-foreground-muted">{item.reorderLevel.toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        {item.belowReorderLevel ? <Badge tone="warning">Reorder now</Badge> : <Badge tone="success">OK</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Shrinkage &amp; Waste</CardTitle>
              <CardDescription>Trailing 180 days, by item</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {shrinkage.length === 0 ? (
              <EmptyState title="No shrinkage recorded" description="No shrinkage movements in the trailing 180 days." />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Item</TableHeaderCell>
                    <TableHeaderCell className="text-right">Units shrunk</TableHeaderCell>
                    <TableHeaderCell className="text-right">Est. cost</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shrinkage.map((s) => (
                    <TableRow key={s.itemId}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{s.unitsShrunk.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right font-medium">{formatInr(s.estimatedCostInr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Vendor Cost Analysis</CardTitle>
              <CardDescription>Trailing 180 days, restock spend by vendor</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {vendorCosts.length === 0 ? (
              <EmptyState title="No restocks recorded" description="No restock movements in the trailing 180 days." />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Vendor</TableHeaderCell>
                    <TableHeaderCell className="text-right">Restocks</TableHeaderCell>
                    <TableHeaderCell className="text-right">Total cost</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vendorCosts.map((v) => (
                    <TableRow key={v.vendorName}>
                      <TableCell className="font-medium">{v.vendorName}</TableCell>
                      <TableCell className="text-right">{v.itemsRestocked}</TableCell>
                      <TableCell className="text-right font-medium">{formatInr(v.totalCostInr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
