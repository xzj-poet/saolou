export type AdminDormitorySummary = {
  floor: string;
  id: string;
  isActive: boolean;
  isProtected: boolean;
  roomNo: string;
  sortOrder: number;
};

export type AdminBuildingSummary = {
  dormitories: AdminDormitorySummary[];
  dormitoryCount: number;
  floorCount: number;
  gender: "MALE" | "FEMALE";
  id: string;
  isActive: boolean;
  name: string;
  note: string | null;
  schoolId: string;
  sortOrder: number;
};

export type AdminSchoolSummary = {
  buildingCount: number;
  buildings: AdminBuildingSummary[];
  dormitoryCount: number;
  id: string;
  isActive: boolean;
  name: string;
  sortOrder: number;
};

export type AgentSchoolRow = {
  id: string;
  isAuthorized: boolean;
  name: string;
  sortOrder: number;
};

export type AgentBuildingSummary = {
  counts: { covered: number; pending: number; unvisited: number };
  dormitoryCount: number;
  floorCount: number;
  gender: "MALE" | "FEMALE";
  id: string;
  name: string;
  note: string | null;
  sortOrder: number;
};

export type AgentBuildingPage = {
  buildings: AgentBuildingSummary[];
  school: { id: string; name: string };
};

export type AgentDormitoryRow = {
  id: string;
  roomNo: string;
  sortOrder: number;
};

export type AgentDormitoryFloor = {
  dormitories: AgentDormitoryRow[];
  floor: string;
};

export type AgentDormitoryDirectory = {
  building: { id: string; name: string; note: string | null };
  floors: AgentDormitoryFloor[];
  school: { id: string; name: string };
};
