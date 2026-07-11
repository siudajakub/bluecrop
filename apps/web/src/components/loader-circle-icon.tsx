"use client";

import {
  LazyMotion,
  domMin,
  m,
  useAnimation,
  useReducedMotion,
} from "motion/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
  type MouseEvent,
} from "react";

export interface LoaderCircleIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LoaderCircleIconProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  | "color"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
> {
  size?: number;
  duration?: number;
  isAnimated?: boolean;
  color?: string;
}

const LoaderCircleIcon = forwardRef<LoaderCircleIconHandle, LoaderCircleIconProps>(
  (
    {
      onMouseEnter,
      onMouseLeave,
      className,
      size = 24,
      duration = 1,
      isAnimated = true,
      color,
      ...props
    },
    ref,
  ) => {
    const controls = useAnimation();
    const reduced = useReducedMotion();
    const isControlled = useRef(false);

    const start = useCallback(() => {
      if (reduced) return controls.start("normal");
      return controls.start("animate");
    }, [controls, reduced]);

    useEffect(() => {
      if (isAnimated) void start();
      else void controls.start("normal");
    }, [controls, isAnimated, start]);

    useImperativeHandle(ref, () => {
      isControlled.current = true;
      return {
        startAnimation: start,
        stopAnimation: () => controls.start("normal"),
      };
    }, [controls, start]);

    const handleEnter = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated || reduced) return;
        if (!isControlled.current) void start();
        onMouseEnter?.(event);
      },
      [isAnimated, onMouseEnter, reduced, start],
    );

    const handleLeave = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!isAnimated && !isControlled.current) void controls.start("normal");
        onMouseLeave?.(event);
      },
      [controls, isAnimated, onMouseLeave],
    );

    return (
      <LazyMotion features={domMin} strict>
        <m.div
          className={["loader-circle-icon", className].filter(Boolean).join(" ")}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          {...props}
          style={{ color, ...props.style }}
        >
          <m.svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={controls}
            initial="normal"
            variants={{
              normal: { rotate: 0 },
              animate: {
                rotate: 360,
                transition: {
                  duration,
                  ease: "linear",
                  repeat: Infinity,
                },
              },
            }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </m.svg>
        </m.div>
      </LazyMotion>
    );
  },
);

LoaderCircleIcon.displayName = "LoaderCircleIcon";

export { LoaderCircleIcon };
