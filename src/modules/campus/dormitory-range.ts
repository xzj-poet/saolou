export type DormitoryRangeInput = {
  floorEnd: number;
  floorStart: number;
  roomEnd: number;
  roomStart: number;
};

export type GeneratedDormitory = {
  floor: string;
  roomNo: string;
  sortOrder: number;
};

export class DormitoryRangeError extends Error {
  constructor(
    public readonly code:
      | "DORMITORY_RANGE_INVALID"
      | "DORMITORY_RANGE_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "DormitoryRangeError";
  }
}

export function generateDormitoryRange(
  input: DormitoryRangeInput,
): GeneratedDormitory[] {
  const values = [input.floorStart, input.floorEnd, input.roomStart, input.roomEnd];
  if (
    values.some((value) => !Number.isInteger(value) || value < 1 || value > 99) ||
    input.floorStart > input.floorEnd ||
    input.roomStart > input.roomEnd
  ) {
    throw new DormitoryRangeError(
      "DORMITORY_RANGE_INVALID",
      "楼层和房号范围必须是 1 到 99 之间的有效整数",
    );
  }

  const count =
    (input.floorEnd - input.floorStart + 1) *
    (input.roomEnd - input.roomStart + 1);
  if (count > 500) {
    throw new DormitoryRangeError(
      "DORMITORY_RANGE_TOO_LARGE",
      "一次最多生成 500 间宿舍",
    );
  }

  const result: GeneratedDormitory[] = [];
  for (let floor = input.floorStart; floor <= input.floorEnd; floor += 1) {
    for (let room = input.roomStart; room <= input.roomEnd; room += 1) {
      const roomNo = `${floor}${String(room).padStart(2, "0")}`;
      result.push({ floor: String(floor), roomNo, sortOrder: Number(roomNo) });
    }
  }
  return result;
}
