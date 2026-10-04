const Brand = ({ compact = false }) => (
  <span className="aitheris-brand" aria-label="RAG">
    <span className="aitheris-mark" style={{ backgroundImage: `url("${process.env.PUBLIC_URL}/aitheris-logo.png")` }} aria-hidden="true" />
    {!compact && <span className="aitheris-wordmark font-bold tracking-wider">RAG</span>}
  </span>
);

export default Brand;
