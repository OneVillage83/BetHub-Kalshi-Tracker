import { EmptyState } from "./empty-state";

export type DataTableColumn<TRow> = {
  key: string;
  header: string;
  render: (row: TRow) => React.ReactNode;
};

export function DataTable<TRow extends { id: string }>({
  title,
  columns,
  rows,
  emptyTitle,
  emptyDetail,
}: {
  title: string;
  columns: Array<DataTableColumn<TRow>>;
  rows: TRow[];
  emptyTitle: string;
  emptyDetail: string;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className="px-3 py-3 font-medium">
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-800">
                  {columns.map((column) => (
                    <td key={column.key} className="px-3 py-3 text-slate-200">
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
