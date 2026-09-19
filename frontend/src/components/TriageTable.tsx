import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
  SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ActionItemDTO, NormalizedStatus, updateActionItem } from "../api";

const STATUS_OPTIONS: NormalizedStatus[] = ["PENDING", "IN_PROGRESS", "RESOLVED", "BLOCKED"];

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const columnHelper = createColumnHelper<ActionItemDTO>();

export function TriageTable({ items }: { items: ActionItemDTO[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "priority", desc: true }]);
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: NormalizedStatus }) =>
      updateActionItem(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["action-items"] }),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.directive.referenceCode, {
        id: "reference",
        header: "Reference",
        cell: (info) => <span className="ref-code">{info.getValue()}</span>,
        size: 120,
      }),
      columnHelper.accessor((row) => row.description, {
        id: "description",
        header: "Action item",
        cell: (info) => (
          <div className="cell-title">
            <div>{info.getValue()}</div>
            <div className="directive-title">{info.row.original.directive.title}</div>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.directive.authorityName, {
        id: "authority",
        header: "Authority",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor((row) => row.priority, {
        id: "priority",
        header: "Priority",
        sortingFn: (a, b) => {
          const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
          return order[a.original.priority] - order[b.original.priority];
        },
        cell: (info) => (
          <span>
            <span className={`priority-dot priority-${info.getValue().toLowerCase()}`} />
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.normalizedStatus, {
        id: "status",
        header: "Status",
        cell: (info) => {
          const item = info.row.original;
          return (
            <select
              className="status-select"
              value={item.normalizedStatus}
              onChange={(e) =>
                statusMutation.mutate({ id: item.id, status: e.target.value as NormalizedStatus })
              }
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          );
        },
      }),
      columnHelper.accessor((row) => row.assignee, {
        id: "assignee",
        header: "Assignee",
        cell: (info) =>
          info.getValue() ? info.getValue() : <span className="assignee-empty">Unassigned</span>,
      }),
      columnHelper.accessor((row) => row.dueDate, {
        id: "dueDate",
        header: "Due",
        cell: (info) => {
          const item = info.row.original;
          const cls = !item.dueDate ? "missing" : item.overdue ? "overdue" : "";
          return <span className={`due-date ${cls}`}>{formatDate(item.dueDate)}</span>;
        },
      }),
      columnHelper.display({
        id: "flags",
        header: "Flags",
        cell: (info) => {
          const item = info.row.original;
          if (!item.flagged) return null;
          return (
            <span className="flag-icon" title={item.flagReasons.join(" | ")}>
              ⚠ {item.flagReasons.length}
            </span>
          );
        },
      }),
    ],
    [statusMutation]
  );

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((header) => (
              <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                {flexRender(header.column.columnDef.header, header.getContext())}
                {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className={row.original.flagged ? "row-flagged" : ""}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
