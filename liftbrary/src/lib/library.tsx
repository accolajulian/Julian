import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import type { Workout } from './types';

// Everything is saved on the phone under this one key. Nothing leaves the device.
const STORAGE_KEY = 'liftbrary.workouts.v1';

type Library = {
  workouts: Workout[];
  loaded: boolean;
  addWorkout: (workout: Omit<Workout, 'id' | 'createdAt'>) => void;
  updateWorkout: (id: string, changes: Partial<Omit<Workout, 'id'>>) => void;
  deleteWorkout: (id: string) => void;
};

const LibraryContext = createContext<Library | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load saved workouts once when the app starts.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setWorkouts(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Update the list on screen and write it to the phone's storage.
  const save = useCallback((update: (current: Workout[]) => Workout[]) => {
    setWorkouts((current) => {
      const next = update(current);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const addWorkout = useCallback<Library['addWorkout']>(
    (workout) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      save((current) => [{ ...workout, id, createdAt: Date.now() }, ...current]);
    },
    [save]
  );

  const updateWorkout = useCallback<Library['updateWorkout']>(
    (id, changes) => save((current) => current.map((w) => (w.id === id ? { ...w, ...changes } : w))),
    [save]
  );

  const deleteWorkout = useCallback<Library['deleteWorkout']>(
    (id) => save((current) => current.filter((w) => w.id !== id)),
    [save]
  );

  return (
    <LibraryContext.Provider value={{ workouts, loaded, addWorkout, updateWorkout, deleteWorkout }}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary(): Library {
  const library = useContext(LibraryContext);
  if (!library) throw new Error('useLibrary must be used inside LibraryProvider');
  return library;
}
