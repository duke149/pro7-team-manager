"use client";

import { ArrowDownAZ, Search, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

import type { SquadFilters } from "../../../../lib/squad/filters";

const POSITIONS = ["all", "GK", "DEF", "MID", "ATT"] as const;
const STATUS_LABELS = {
  active: "Sẵn sàng",
  injured: "Chấn thương",
  unavailable: "Không sẵn sàng",
  inactive: "Ngừng hoạt động",
} as const;

function squadHref(
  slug: string,
  filters: SquadFilters,
  overrides: Partial<Pick<SquadFilters, "q" | "position" | "status" | "sort" | "direction">> = {},
): string {
  const values = { ...filters, ...overrides };
  const parameters = new URLSearchParams({
    q: values.q,
    position: values.position,
    status: values.status,
    sort: values.sort,
    direction: values.direction,
  });
  return `/teams/${encodeURIComponent(slug)}/squad?${parameters.toString()}`;
}

function PositionLinks({ slug, filters }: { slug: string; filters: SquadFilters }) {
  return (
    <div className="filter-row" aria-label="Vị trí cầu thủ">
      {POSITIONS.map((position) => (
        <a
          key={position}
          className={filters.position === position ? "active" : undefined}
          aria-current={filters.position === position ? "page" : undefined}
          href={squadHref(slug, filters, { position })}
        >
          {position === "all" ? "Tất cả" : position}
        </a>
      ))}
    </div>
  );
}

export function SquadToolbar({
  slug,
  filters,
  disabled = false,
}: {
  slug: string;
  filters: SquadFilters;
  disabled?: boolean;
}) {
  const router = useRouter();
  const action = `/teams/${encodeURIComponent(slug)}/squad`;

  function navigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const parameters = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget).entries()) {
      if (typeof value === "string") parameters.append(key, value);
    }
    router.push(`${action}?${parameters.toString()}`);
  }

  return (
    <section className="squad-toolbar card" aria-label="Tìm và lọc cầu thủ">
      <form className="search-box" action={action} method="get" onSubmit={navigate}>
        <Search size={19} />
        <label className="sr-only" htmlFor="squad-search">Tìm theo tên cầu thủ</label>
        <input id="squad-search" name="q" defaultValue={filters.q} placeholder="Tìm theo tên cầu thủ..." disabled={disabled} />
        <input type="hidden" name="position" value={filters.position} />
        <input type="hidden" name="status" value={filters.status} />
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="direction" value={filters.direction} />
        <button className="sr-only" type="submit">Tìm kiếm</button>
      </form>
      {disabled ? (
        <div className="filter-row" aria-hidden="true">
          {POSITIONS.map((position) => <span key={position}>{position === "all" ? "Tất cả" : position}</span>)}
        </div>
      ) : <PositionLinks slug={slug} filters={filters} />}
      <details className="squad-filter-panel">
        <summary className="filter-button"><SlidersHorizontal size={17} /> Bộ lọc</summary>
        <form action={action} method="get" onSubmit={navigate}>
          <input type="hidden" name="q" value={filters.q} />
          <input type="hidden" name="position" value={filters.position} />
          <label>Tình trạng<select name="status" defaultValue={filters.status} disabled={disabled}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Sắp xếp<select name="sort" defaultValue={filters.sort} disabled={disabled}><option value="name">Tên cầu thủ</option><option value="shirt_number">Số áo</option><option value="position">Vị trí</option><option value="join_date">Ngày gia nhập</option><option value="status">Tình trạng</option></select></label>
          <label>Thứ tự<select name="direction" defaultValue={filters.direction} disabled={disabled}><option value="asc">Tăng dần</option><option value="desc">Giảm dần</option></select></label>
          <button className="primary-button" type="submit" disabled={disabled}><ArrowDownAZ size={16} /> Áp dụng</button>
        </form>
      </details>
    </section>
  );
}
