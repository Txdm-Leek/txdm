import { useState } from "react";
function ListGroup(): import("react").JSX.Element {
  let items = ["newyork", "san fransisco", "addis"];
  const [selectedIndex, setSelectedIndex] = useState(-1);

  return (
    <>
      <h1>List</h1>
   {/*  {items.length === 0 && <p>no item found</p>}*/} 
      <ul className="list-group">
        {items.map((item, index) => (
          <li
            className={ 
              selectedIndex === index
              ? "list-group-item active"
               : "list-group-item"}
            key={item}
            onClick={() => {setSelectedIndex(index)}}
          >
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}

export default ListGroup;

