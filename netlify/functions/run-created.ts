// Netlify discovers workload handlers from the Functions directory.
// The implementation remains separate so workflow code is easy to test.
export { default, asyncWorkloadConfig } from "../async-workloads/run-created";
