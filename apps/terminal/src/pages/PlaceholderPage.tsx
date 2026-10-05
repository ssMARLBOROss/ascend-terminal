type Props={title:string;subtitle:string;onBack:()=>void};
export default function PlaceholderPage({title,subtitle,onBack}:Props){
 return <main className="placeholder-page"><div className="placeholder-core"><span>ASCEND</span><h1>{title}</h1><p>{subtitle}</p><button onClick={onBack}>← Вернуться в Обзор <small>Back to Overview</small></button></div></main>
}
