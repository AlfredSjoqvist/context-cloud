export type Greeting = { hello: string };

export const greet = (g: Greeting): string => g.hello;
