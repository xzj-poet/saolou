import type { AdminBuildingSummary } from "@/modules/campus/campus-types";

function floorOrder(left: string, right: string) {
  const numeric = Number(right) - Number(left);
  return Number.isNaN(numeric) ? right.localeCompare(left, "zh-CN") : numeric;
}

export function BuildingBlueprint({ building }: { building: AdminBuildingSummary }) {
  const grouped = new Map<string, AdminBuildingSummary["dormitories"]>();
  for (const dormitory of building.dormitories) {
    grouped.set(dormitory.floor, [...(grouped.get(dormitory.floor) ?? []), dormitory]);
  }

  if (grouped.size === 0) {
    return <div className="empty-panel compact">尚未添加宿舍，请从楼栋菜单进入“宿舍管理”。</div>;
  }

  return (
    <div className="building-blueprint">
      {[...grouped.entries()].sort(([left], [right]) => floorOrder(left, right)).map(([floor, rows]) => (
        <section className="blueprint-floor" key={floor}>
          <h3>{floor}楼</h3>
          <div className="blueprint-rooms">
            {rows.map((room) => (
              <div
                aria-label={room.isProtected ? `${room.roomNo} 有扫楼记录，受保护` : room.roomNo}
                className={`blueprint-room${room.isActive ? "" : " is-disabled"}`}
                key={room.id}
              >
                <strong>{room.roomNo}</strong>
                {room.isProtected ? <span aria-hidden="true">🔒</span> : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
