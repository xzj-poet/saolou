import {requireUser} from "@/modules/auth/current-user";
import {BatchSelector} from "@/modules/sweep/agent/building-matrix";
import {getBuildingMatrixForAgent} from "@/modules/sweep/sweep-read-service";
import {listActiveQuickNotes} from "@/modules/quick-notes/quick-note-service";
export default async function BatchPage({params,searchParams}:{params:Promise<{buildingId:string}>;searchParams:Promise<{floor?:string}>}){const[user,{buildingId},query,pending,covered]=await Promise.all([requireUser(),params,searchParams,listActiveQuickNotes("PENDING"),listActiveQuickNotes("COVERED")]);const matrix=await getBuildingMatrixForAgent(user.id,buildingId,query.floor);const selectedFloor=query.floor??matrix.floors[0]?.floor??"";return <BatchSelector buildingId={buildingId} floor={selectedFloor} quickNotes={[...pending,...covered]} rooms={matrix.floors.flatMap(row=>row.dormitories)}/>;}
