import { useStore } from '../store/characters';
import { About } from './About';
import { CharacterList } from './CharacterList';
import { CharacterSheet } from './CharacterSheet';
import { NewCharacter } from './NewCharacter';
import { useRoute } from './router';

export function App() {
  const s = useStore();
  const [first, id, tab] = useRoute();
  if (s.status === 'loading') {
    return (
      <main className="page">
        <p className="muted">Opening your characters…</p>
      </main>
    );
  }
  if (first === 'new') return <NewCharacter />;
  if (first === 'about') return <About />;
  if (first === 'c' && id) return <CharacterSheet key={id} id={id} tab={tab ?? 'play'} />;
  return <CharacterList />;
}
