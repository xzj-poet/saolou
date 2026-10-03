export function toggleRoomSelection(current:string[],roomNo:string){return current.includes(roomNo)?current.filter(value=>value!==roomNo):[...current,roomNo].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));}
export function selectionTitle(roomNos:string[]){return roomNos.length?`标记 ${[...roomNos].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).join("、")}`:"标记宿舍";}
