export { Hook, HookType } from "./hooks/hookObject";
import { useState } from "./hooks/useState";
import { useRef } from "./hooks/useRef";
import { useEffect } from "./hooks/useEffect";
import { useViewTransition } from "./hooks/useViewTransition";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useEventListener } from "./hooks/useEventListener";
import { useQuerySelector } from "./hooks/useQuerySelector";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useCallback } from "./hooks/useCallback";
import { useMemo } from "./hooks/useMemo";
import { useReducer } from "./hooks/useReducer";
import { useId } from "./hooks/useId";

export const HOOKS = {
	useState,
	useViewTransition,
	useLocalStorage,
	useRef,
	useEffect,
	useEventListener,
	useQuerySelector,
	useMediaQuery,
	useCallback,
	useMemo,
	useReducer,
	useId
};
