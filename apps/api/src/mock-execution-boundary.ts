export function assertEngineeringVerticalSliceMockExecution(entrypoint: string): void {
  const runtimeEnvironment = process.env.NODE_ENV;
  if (runtimeEnvironment === 'development' || runtimeEnvironment === 'test') return;

  throw new Error(
    `${entrypoint} is restricted to development/test Engineering Vertical Slice fixtures.`,
  );
}
