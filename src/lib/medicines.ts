import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export type Medicine = {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  quantity: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export const MEDICINE_FREQUENCIES = [
  "每日一次",
  "每日两次",
  "每日三次",
  "每周一次",
  "按需服用",
] as const;

const STORAGE_KEY = "medicines";

async function readAll(): Promise<Medicine[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(medicines: Medicine[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(medicines));
}

export async function getMedicine(id: string): Promise<Medicine | null> {
  const medicines = await readAll();
  return medicines.find((m) => m.id === id) ?? null;
}

export async function addMedicine(
  input: Omit<Medicine, "id" | "createdAt" | "updatedAt">
): Promise<Medicine> {
  const medicines = await readAll();
  const now = new Date().toISOString();
  const medicine: Medicine = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  await writeAll([medicine, ...medicines]);
  return medicine;
}

export async function updateMedicine(
  id: string,
  patch: Partial<Omit<Medicine, "id" | "createdAt">>
): Promise<void> {
  const medicines = await readAll();
  await writeAll(
    medicines.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m
    )
  );
}

export async function deleteMedicine(id: string): Promise<void> {
  const medicines = await readAll();
  await writeAll(medicines.filter((m) => m.id !== id));
}

export function useMedicines() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setMedicines(await readAll());
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { medicines, loading, reload };
}
