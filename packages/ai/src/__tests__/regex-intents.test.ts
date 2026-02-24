import { describe, it, expect } from 'vitest';
import { REGEX_INTENTS } from '@camello/shared/constants';

function matches(intent: string, msg: string): boolean {
  return REGEX_INTENTS[intent].some((p: RegExp) => p.test(msg));
}

describe('REGEX_INTENTS greeting', () => {
  it('matches bare greetings', () => {
    expect(matches('greeting', 'hola')).toBe(true);
    expect(matches('greeting', 'hello')).toBe(true);
    expect(matches('greeting', 'Hi')).toBe(true);
    expect(matches('greeting', 'hey')).toBe(true);
  });

  it('matches greetings with trailing punctuation', () => {
    expect(matches('greeting', 'hola!')).toBe(true);
    expect(matches('greeting', 'hello.')).toBe(true);
    expect(matches('greeting', 'hey!!')).toBe(true);
    expect(matches('greeting', 'hi?')).toBe(true);
    expect(matches('greeting', 'hola,')).toBe(true);
  });

  it('matches greetings with trailing whitespace', () => {
    expect(matches('greeting', 'hola  ')).toBe(true);
    expect(matches('greeting', 'hello! ')).toBe(true);
  });

  it('does NOT match greetings followed by questions', () => {
    expect(matches('greeting', 'hola que servicio ofrecen?')).toBe(false);
    expect(matches('greeting', 'hello what services do you offer?')).toBe(false);
    expect(matches('greeting', 'hey can you help me?')).toBe(false);
    expect(matches('greeting', 'hi I need support')).toBe(false);
    expect(matches('greeting', 'hola, me pueden ayudar?')).toBe(false);
  });
});

describe('REGEX_INTENTS farewell', () => {
  it('matches bare farewells', () => {
    expect(matches('farewell', 'bye')).toBe(true);
    expect(matches('farewell', 'goodbye')).toBe(true);
    expect(matches('farewell', 'see you')).toBe(true);
    expect(matches('farewell', 'thanks')).toBe(true);
    expect(matches('farewell', 'thank you')).toBe(true);
  });

  it('matches farewells with trailing punctuation', () => {
    expect(matches('farewell', 'bye!')).toBe(true);
    expect(matches('farewell', 'thanks.')).toBe(true);
    expect(matches('farewell', 'thank you!!')).toBe(true);
  });

  it('does NOT match farewells followed by additional text', () => {
    expect(matches('farewell', 'thanks for your help with everything')).toBe(false);
    expect(matches('farewell', 'bye but one more question')).toBe(false);
    expect(matches('farewell', 'thank you can you also send me the docs?')).toBe(false);
  });
});
