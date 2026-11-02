'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { mapInspectionResponseSchema, type MapInspection } from '@ecosuitability/contracts';
import { useAnalysisApi } from '../analysis/api';
import type { Coordinates } from './map-types';

type InspectionState = {
  inspection?: MapInspection;
  coordinates?: Coordinates;
  inspectorOpen: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
};

type InspectionAction =
  | { type: 'start'; coordinates: Coordinates }
  | { type: 'success'; inspection: MapInspection; openInspector: boolean }
  | { type: 'failure'; message: string }
  | { type: 'set-open'; open: boolean };

const initialState: InspectionState = {
  inspectorOpen: false,
  status: 'idle',
};

const reducer = (state: InspectionState, action: InspectionAction): InspectionState => {
  switch (action.type) {
    case 'start':
      return { ...state, coordinates: action.coordinates, status: 'loading', error: undefined };
    case 'success':
      return {
        ...state,
        inspection: action.inspection,
        inspectorOpen: state.inspectorOpen || action.openInspector,
        status: 'ready',
        error: undefined,
      };
    case 'failure':
      return { ...state, status: 'error', error: action.message };
    case 'set-open':
      return { ...state, inspectorOpen: action.open };
  }
};

export const useMapInspection = (analysisId: string) => {
  const api = useAnalysisApi();
  const request = useRef<AbortController | undefined>(undefined);
  const [state, dispatch] = useReducer(reducer, initialState);

  const inspect = useCallback(
    (coordinates: Coordinates) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      dispatch({ type: 'start', coordinates });

      void api
        .json(
          `/v1/analyses/${analysisId}/map/inspect?longitude=${coordinates.longitude}&latitude=${coordinates.latitude}`,
          mapInspectionResponseSchema,
          { signal: controller.signal }
        )
        .then((response) => {
          if (!controller.signal.aborted) {
            dispatch({
              type: 'success',
              inspection: response.inspection,
              openInspector: window.matchMedia('(max-width: 1023px)').matches,
            });
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            dispatch({
              type: 'failure',
              message: error instanceof Error ? error.message : 'Inspection failed.',
            });
          }
        });
    },
    [analysisId, api]
  );

  useEffect(
    () => () => {
      request.current?.abort();
    },
    []
  );

  return {
    state,
    inspect,
    setInspectorOpen: (open: boolean) => dispatch({ type: 'set-open', open }),
  };
};
