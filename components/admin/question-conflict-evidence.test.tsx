import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {QuestionConflictEvidence} from './question-conflict-evidence';
import {questionConflictProvenance} from '../../lib/question-conflict-provenance';
describe('structural evidence rendering',()=>{
 it('renders only affected records with correct UUID and individual review link',()=>{
  const id='f129c629-3a13-490c-af58-7b5c75601ec3';
  const p=questionConflictProvenance([{id,slug:'l9099',assunto:'Art.35',ordem:'0003.0.00.0.00.0',structure_id:777}]);
  const html=renderToStaticMarkup(<QuestionConflictEvidence questions={p.affected} total={13}/>);
  expect(html).toContain('1 de 13'); expect(html).toContain(id);expect(html).toContain('question_id='+id);
  expect(html).toContain('Art.35');expect(html).toContain('777');expect(html).toContain('0035.0.00.0.00.0');expect(html).toContain('demais 12');
 });
 it('does not render a structural warning without affected members',()=>expect(renderToStaticMarkup(<QuestionConflictEvidence questions={[]} total={13}/>)).toBe(''));
});
