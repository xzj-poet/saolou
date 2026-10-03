import {fireEvent,render,screen} from "@testing-library/react";
import {describe,expect,it} from "vitest";
import {BatchSelector,BuildingMatrix} from "@/modules/sweep/agent/building-matrix";

const matrix={building:{id:"b1",name:"3号楼",note:null},counts:{covered:1,pending:1,unvisited:1},floors:[{floor:"1",dormitories:[{floor:"1",hasMyRecord:false,id:"d1",overallStatus:"UNVISITED" as const,roomNo:"101",sortOrder:101},{floor:"1",hasMyRecord:false,id:"d2",overallStatus:"PENDING" as const,roomNo:"102",sortOrder:102},{floor:"1",hasMyRecord:true,id:"d3",overallStatus:"COVERED" as const,roomNo:"103",sortOrder:103}]}],school:{id:"s1",name:"本部"}};
describe("BuildingMatrix",()=>{
 it("renders statuses, counts, star, and record routing",()=>{render(<BuildingMatrix floor="1" matrix={matrix}/>);expect(screen.getByText("1 已覆盖")).toBeInTheDocument();expect(screen.getByRole("link",{name:/101.*未扫/})).toHaveAttribute("href","/app/dormitories/d1/record?floor=1");expect(screen.getByRole("link",{name:/103.*已覆盖.*我扫过/})).toHaveAttribute("href","/app/dormitories/d3?floor=1");expect(screen.getByText("★")).toBeInTheDocument();});
 it("requires a selection before advancing and lists exact rooms",()=>{render(<BatchSelector buildingId="b1" floor="1" rooms={matrix.floors[0].dormitories}/>);expect(screen.getByRole("button",{name:"请先选择宿舍"})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:/选择101/}));fireEvent.click(screen.getByRole("button",{name:/选择103/}));expect(screen.getByRole("heading",{name:"选择宿舍 · 2间"})).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"下一步 · 标记2间"}));expect(screen.getByRole("heading",{name:"标记 101、103"})).toBeInTheDocument();expect(screen.getByRole("link",{name:"返回选择"})).toBeInTheDocument();});
});
