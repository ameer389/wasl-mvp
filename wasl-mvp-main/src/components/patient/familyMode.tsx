import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { readStored, writeStored } from '../../lib/storage';

interface FamilyMode {
  family: boolean;
  setFamily: (on: boolean) => void;
}

const FamilyModeContext = createContext<FamilyMode>({ family: false, setFamily: () => {} });

const key = (patientId: string) => `wasl.ui.familyMode.${patientId}`;

/** «أنا من أهل المريض» — remembered per patient (browser storage, a per-viewer convenience). */
export function FamilyModeProvider({ patientId, children }: { patientId: string; children: ReactNode }) {
  const [family, setFamilyState] = useState(() => readStored(key(patientId), false));
  useEffect(() => setFamilyState(readStored(key(patientId), false)), [patientId]);
  const setFamily = useCallback(
    (on: boolean) => {
      setFamilyState(on);
      writeStored(key(patientId), on);
    },
    [patientId],
  );
  return <FamilyModeContext.Provider value={{ family, setFamily }}>{children}</FamilyModeContext.Provider>;
}

export function useFamilyMode(): FamilyMode {
  return useContext(FamilyModeContext);
}
