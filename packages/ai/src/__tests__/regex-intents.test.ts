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
    expect(matches('greeting', 'hi?')).toBe(false);  // question form falls to LLM
  });

  it('matches extended greeting forms', () => {
    expect(matches('greeting', 'hello there')).toBe(true);
    expect(matches('greeting', 'hi team')).toBe(true);
    expect(matches('greeting', 'buenos días')).toBe(true);
    expect(matches('greeting', 'buenas tardes')).toBe(true);
    expect(matches('greeting', 'good morning')).toBe(true);
    expect(matches('greeting', 'good afternoon')).toBe(true);
    expect(matches('greeting', 'good evening')).toBe(true);
  });

  it('does NOT match greetings with embedded content (falls to LLM)', () => {
    expect(matches('greeting', 'hello, I need a quote')).toBe(false);
    expect(matches('greeting', 'hi there how are you doing today')).toBe(false);
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

  it('matches extended farewell forms', () => {
    expect(matches('farewell', 'thanks for your help')).toBe(true);
    expect(matches('farewell', 'gracias')).toBe(true);
    expect(matches('farewell', 'hasta luego')).toBe(true);
    expect(matches('farewell', 'thanks so much')).toBe(true);
    expect(matches('farewell', 'thank you for your help')).toBe(true);
  });
});
