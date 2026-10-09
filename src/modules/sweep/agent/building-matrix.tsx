"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {selectionTitle,toggleRoomSelection} from "@/modules/sweep/agent/batch-selection";
import { readRememberedBuildingFloor, rememberBuildingFloor } from "@/modules/sweep/agent/floor-memory";
import {RecordEditor} from "@/modules/sweep/agent/record-editor";

type Room={floor:string;hasMyRecord:boolean;id:string;myRecordId:string|null;myRecordVersion:number|null;overallStatus:"UNVISITED"|"PENDING"|"COVERED";roomNo:string;sortOrder:number};
type Matrix={building:{id:string;name:string;note:string|null};counts:{covered:number;pending:number;unvisited:number};floors:Array<{floor:string;dormitories:Room[]}>;school:{id:string;name:string}};
const labels={UNVISITED:"⚪ 未扫",PENDING:"🟡 待补扫",COVERED:"🟢 已覆盖"};

export function BuildingMatrix({canRestoreRememberedFloor=true,floorMemoryKey,matrix,floor}:{canRestoreRememberedFloor?:boolean;floorMemoryKey?:string;matrix:Matrix;floor:string}) {
  const router=useRouter();
  const restoredRememberedFloor=useRef(false);
  const floors = [...matrix.floors].sort((left,right)=>Number(left.floor)-Number(right.floor)||left.floor.localeCompare(right.floor));
  const selectedRow = floors.find((row)=>row.floor===floor) ?? floors[0];
  const selectedFloor = selectedRow?.floor ?? "";
  const hasDormitories = floors.some((row) => row.dormitories.length > 0);
  useEffect(() => {
    const rememberedFloor = readRememberedBuildingFloor(floorMemoryKey);
    if (!restoredRememberedFloor.current && canRestoreRememberedFloor && rememberedFloor && rememberedFloor !== selectedFloor && floors.some((row) => row.floor === rememberedFloor)) {
      restoredRememberedFloor.current = true;
      router.replace(`/app/buildings/${matrix.building.id}?floor=${encodeURIComponent(rememberedFloor)}`);
      return;
    }
    restoredRememberedFloor.current = true;
    rememberBuildingFloor(floorMemoryKey, selectedFloor);
  }, [canRestoreRememberedFloor, floorMemoryKey, floors, matrix.building.id, router, selectedFloor]);
  return <main className="agent-page">
    <Link className="mobile-back-button" href={`/app/schools/${matrix.school.id}/buildings`}>‹ 返回楼栋选择</Link>
    <p className="page-kicker">{matrix.school.name}</p>
    <h1>{matrix.building.name}</h1>
    <div className="matrix-stats"><b>{matrix.counts.covered} 已覆盖</b><b>{matrix.counts.pending} 待补扫</b><b>{matrix.counts.unvisited} 未扫</b></div>
    {hasDormitories ? <>
      <nav className="matrix-floors">{floors.map(row=><Link aria-current={row.floor===selectedFloor?"page":undefined} href={`/app/buildings/${matrix.building.id}?floor=${encodeURIComponent(row.floor)}`} key={row.floor} onClick={() => rememberBuildingFloor(floorMemoryKey, row.floor)}>{row.floor}楼</Link>)}</nav>
      {selectedRow?<div className="matrix-rooms">{selectedRow.dormitories.map(room=><Link aria-label={`${room.roomNo} ${labels[room.overallStatus]}${room.hasMyRecord?" 我扫过":""}`} className={`matrix-room is-${room.overallStatus.toLowerCase()}`} href={`/app/dormitories/${room.id}${room.hasMyRecord?"":"/record"}?floor=${encodeURIComponent(selectedFloor)}`} key={room.id}><span>{room.roomNo}</span><small>{labels[room.overallStatus]}</small>{room.hasMyRecord?<i>★</i>:null}</Link>)}</div>:null}
      <Link className="primary-link" href={`/app/buildings/${matrix.building.id}/batch?floor=${encodeURIComponent(selectedFloor)}`}>批量标记</Link>
    </> : <section className="empty-panel compact"><strong>该楼栋还没有宿舍</strong><span>请返回楼栋选择并联系管理员添加宿舍。</span></section>}
  </main>;
}

export function BatchSelector({buildingId,floor,quickNotes=[],rooms}:{buildingId:string;floor:string;quickNotes?:Array<{content:string;id:string;status:"PENDING"|"COVERED"}>;rooms:Room[]}){const[selected,setSelected]=useState<string[]>(()=>{if(typeof window==="undefined")return[];const saved=sessionStorage.getItem(`sweep-batch:${buildingId}:${floor}`);if(!saved)return[];try{return JSON.parse(saved);}catch{return[];}});const[step,setStep]=useState<"select"|"edit">("select");useEffect(()=>{sessionStorage.setItem(`sweep-batch:${buildingId}:${floor}`,JSON.stringify(selected));},[buildingId,floor,selected]);if(step==="edit")return <div><a aria-label="返回选择" className="mobile-back-button batch-back" href="#select" onClick={event=>{event.preventDefault();setStep("select")}}>‹ 返回选择</a><RecordEditor backHref={`/app/buildings/${buildingId}/batch?floor=${encodeURIComponent(floor)}`} buildingId={buildingId} dormitories={rooms.filter(room=>selected.includes(room.roomNo)).map(({id,myRecordId,myRecordVersion,roomNo})=>({expectedRecordId:myRecordId,expectedVersion:myRecordVersion,id,roomNo}))} floor={floor} mode="batch" quickNotes={quickNotes} title={selectionTitle(selected)}/></div>;return <main className="agent-page"><Link className="mobile-back-button" href={`/app/buildings/${buildingId}?floor=${encodeURIComponent(floor)}`}>‹ 退出批量模式</Link><h1>选择宿舍 · {selected.length}间</h1><div className="matrix-rooms">{rooms.map(room=><button aria-label={`选择${room.roomNo}`} aria-pressed={selected.includes(room.roomNo)} className={`matrix-room is-${room.overallStatus.toLowerCase()}`} key={room.id} onClick={()=>setSelected(toggleRoomSelection(selected,room.roomNo))} type="button">{room.roomNo}</button>)}</div><button className="primary-button full-button" disabled={!selected.length} onClick={()=>setStep("edit")} type="button">{selected.length?`下一步 · 标记${selected.length}间`:"请先选择宿舍"}</button></main>}
